const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { pool, withTransaction } = require('../config/database');
const { authenticateStudent, requireVerified } = require('../middleware/auth');
const auditService = require('../services/audit');
const logger = require('../utils/logger');

// ============================================================
// GET CANDIDATES FOR ACTIVE ELECTION
// ============================================================

router.get('/candidates', authenticateStudent, requireVerified, async (req, res) => {
  try {
    const { rows: election } = await pool.query(
      `SELECT * FROM elections WHERE id = $1`,
      [req.student.election_id]
    );

    if (!election[0]) return res.status(404).json({ error: 'Election not found' });

    const now = new Date();
    if (election[0].status !== 'active') {
      return res.json({
        electionStatus: election[0].status,
        startTime: election[0].start_time,
        endTime: election[0].end_time,
        candidates: null,
        message: election[0].status === 'draft' || election[0].status === 'paused'
          ? 'Voting has not started yet'
          : 'Voting has ended'
      });
    }

    if (new Date(election[0].end_time) < now) {
      // Auto-close election
      await pool.query('UPDATE elections SET status = $1 WHERE id = $2', ['ended', election[0].id]);
      return res.json({ electionStatus: 'ended', message: 'Voting has ended' });
    }

    // Fetch positions with candidates
    const { rows: positions } = await pool.query(
      `SELECT p.id, p.title, p.display_order,
        COALESCE(
          json_agg(
            json_build_object(
              'id', c.id,
              'fullName', c.full_name,
              'program', c.program,
              'level', c.level,
              'bio', c.bio,
              'imageUrl', c.image_url,
              'displayOrder', c.display_order
            ) ORDER BY c.display_order
          ) FILTER (WHERE c.id IS NOT NULL),
          '[]'::json
        ) as candidates
       FROM positions p
       LEFT JOIN candidates c ON c.position_id = p.id AND c.election_id = p.election_id AND c.is_approved = true
       WHERE p.election_id = $1
       GROUP BY p.id, p.title, p.display_order
       ORDER BY p.display_order`,
      [req.student.election_id]
    );

    return res.json({
      electionStatus: 'active',
      election: {
        title: election[0].title,
        endTime: election[0].end_time
      },
      positions,
      hasVoted: req.student.has_voted
    });

  } catch (err) {
    logger.error('Get candidates error:', err);
    return res.status(500).json({ error: 'Failed to load candidates' });
  }
});

// ============================================================
// CAST VOTE — ATOMIC ANONYMOUS TRANSACTION
// ============================================================

router.post('/cast', authenticateStudent, requireVerified, async (req, res) => {
  const { votes } = req.body;
  // votes: [{ positionId, candidateId }, ...]

  if (!votes || !Array.isArray(votes) || votes.length === 0) {
    return res.status(400).json({ error: 'No votes provided' });
  }

  try {
    // Check if already voted
    if (req.student.has_voted) {
      await auditService.log({
        action: 'vote_attempt_duplicate',
        actorType: 'student',
        actorId: req.student.id,
        electionId: req.student.election_id,
        ip: req.ip
      });
      return res.status(409).json({ error: 'You have already voted in this election' });
    }

    // Verify election is active
    const { rows: electionRows } = await pool.query(
      'SELECT * FROM elections WHERE id = $1',
      [req.student.election_id]
    );
    const election = electionRows[0];

    if (!election || election.status !== 'active') {
      return res.status(403).json({ error: 'Election is not currently active' });
    }
    if (new Date(election.end_time) < new Date()) {
      return res.status(403).json({ error: 'Voting period has ended' });
    }

    // Validate all votes
    const { rows: validPositions } = await pool.query(
      'SELECT id FROM positions WHERE election_id = $1',
      [req.student.election_id]
    );
    const positionIds = new Set(validPositions.map(p => p.id));

    for (const vote of votes) {
      if (!positionIds.has(vote.positionId)) {
        return res.status(400).json({ error: `Invalid position: ${vote.positionId}` });
      }

      const { rows: candidateCheck } = await pool.query(
        'SELECT id FROM candidates WHERE id = $1 AND position_id = $2 AND election_id = $3 AND is_approved = true',
        [vote.candidateId, vote.positionId, req.student.election_id]
      );

      if (!candidateCheck[0]) {
        return res.status(400).json({ error: `Invalid candidate selection` });
      }
    }

    // ATOMIC TRANSACTION: record vote status separately from anonymous ballots
    await withTransaction(async (client) => {
      // 1. Check voter_status (double-check inside transaction)
      const { rows: existingVote } = await client.query(
        'SELECT id FROM voter_status WHERE student_id = $1 AND election_id = $2',
        [req.student.id, req.student.election_id]
      );
      if (existingVote[0]) throw new Error('ALREADY_VOTED');

      // 2. Record voter status (who voted — no ballot link)
      await client.query(
        'INSERT INTO voter_status (student_id, election_id, ip_address, user_agent) VALUES ($1, $2, $3, $4)',
        [req.student.id, req.student.election_id, req.ip, req.get('user-agent')]
      );

      // 3. Mark student as voted
      await client.query(
        'UPDATE students SET has_voted = true, voted_at = NOW() WHERE id = $1',
        [req.student.id]
      );

      // 4. Insert anonymous ballots (NO student_id, only cryptographic token)
      for (const vote of votes) {
        const voteMarker = vote.voteType === 'no' ? 'NO' : 'YES';
        // Encode vote type clearly in token: YES_<hash> or NO_<hash>
        // Results query reads the prefix to count YES vs NO separately
        const hashPart = crypto
          .createHmac('sha256', process.env.JWT_SECRET)
          .update(`${req.student.election_id}-${vote.positionId}-${vote.candidateId}-${voteMarker}-${Date.now()}-${crypto.randomBytes(16).toString('hex')}`)
          .digest('hex');

        const ballotToken = `${voteMarker}_${hashPart}`;

        await client.query(
          'INSERT INTO ballots (election_id, position_id, candidate_id, ballot_token) VALUES ($1, $2, $3, $4)',
          [req.student.election_id, vote.positionId, vote.candidateId, ballotToken]
        );
      }
    });

    await auditService.log({
      action: 'vote_cast',
      actorType: 'student',
      actorId: req.student.id,
      electionId: req.student.election_id,
      metadata: { positionCount: votes.length },
      ip: req.ip
    });

    // Generate receipt (not linkable to specific candidates)
    const receiptCode = `VT-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;

    // Send email confirmation if available
    try {
      const { rows: studentRows } = await pool.query('SELECT * FROM students WHERE id = $1', [req.student.id]);
      if (studentRows[0]?.school_email) {
        const emailService = require('../services/email');
        await emailService.sendVoteConfirmationEmail(
          studentRows[0].school_email,
          studentRows[0].full_name,
          new Date(),
          receiptCode
        );
      }
    } catch (emailErr) {
      logger.error('Vote confirmation email failed:', emailErr);
    }

    return res.json({
      message: 'Vote submitted successfully',
      receiptCode,
      timestamp: new Date().toISOString()
    });

  } catch (err) {
    if (err.message === 'ALREADY_VOTED') {
      return res.status(409).json({ error: 'You have already voted in this election' });
    }
    logger.error('Vote cast error:', err);
    return res.status(500).json({ error: 'Failed to record vote. Please try again.' });
  }
});

module.exports = router;
