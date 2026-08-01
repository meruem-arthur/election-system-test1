const express = require('express');
const router = express.Router();
const PDFDocument = require('pdfkit');
const jwt = require('jsonwebtoken');
const { pool } = require('../config/database');
const { authenticateAdmin, authenticateStudent } = require('../middleware/auth');
const logger = require('../utils/logger');

// ============================================================
// Checks whether the bearer token (if any) belongs to an admin who is
// allowed to see this election's results pre-publish — i.e. either a
// super_admin, or an election_admin/observer explicitly assigned to it.
// Mirrors the scoping in middleware/auth.js#requireElectionAccess so
// results can't be viewed cross-election by an unrelated admin.
// Returns false for anonymous/student tokens or invalid/expired ones.
// ============================================================
async function isAuthorizedAdminForElection(req, electionId) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return false;

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return false;
  }
  if (decoded.type !== 'admin') return false;

  const { rows } = await pool.query(
    'SELECT id, role, is_active FROM admins WHERE id = $1',
    [decoded.id]
  );
  const admin = rows[0];
  if (!admin || !admin.is_active) return false;

  if (admin.role === 'super_admin') return true;

  const { rows: assignment } = await pool.query(
    'SELECT 1 FROM admin_election_assignments WHERE admin_id = $1 AND election_id = $2',
    [admin.id, electionId]
  );
  return assignment.length > 0;
}

// ============================================================
// GET RESULTS (Admin always, Students only after publish)
// ============================================================

router.get('/published', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, title, department, academic_year, status, results_published_at
       FROM elections WHERE status = 'results_published' ORDER BY results_published_at DESC`
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch published elections' });
  }
});
router.get('/:electionId', async (req, res) => {
  const { electionId } = req.params;

  try {
    const { rows: [election] } = await pool.query('SELECT * FROM elections WHERE id = $1', [electionId]);
    if (!election) return res.status(404).json({ error: 'Election not found' });

    // Students/anonymous can only see results after official release.
    // Admins can see pre-publish results only for elections they're
    // assigned to (super_admin sees all) — prevents cross-election snooping.
    const isAuthorizedAdmin = await isAuthorizedAdminForElection(req, electionId);

    if (!isAuthorizedAdmin && election.status !== 'results_published') {
      return res.status(403).json({ error: 'Results have not been officially released yet' });
    }

    const { rows: results } = await pool.query(`
      SELECT 
        p.id as position_id,
        p.title as position,
        p.display_order,
        c.id as candidate_id,
        c.full_name as candidate,
        c.image_url,
        c.program,
        c.level,
        COUNT(b.id)::integer as total_votes,
        COUNT(b.id) FILTER (WHERE b.ballot_token NOT LIKE 'NO_%')::integer as yes_votes,
        COUNT(b.id) FILTER (WHERE b.ballot_token LIKE 'NO_%')::integer as no_votes,
        -- Count candidates in this position to detect yes/no positions
        COUNT(DISTINCT c2.id) as position_candidate_count
      FROM positions p
      JOIN candidates c ON c.position_id = p.id AND c.election_id = p.election_id AND c.is_approved = true
      LEFT JOIN candidates c2 ON c2.position_id = p.id AND c2.election_id = p.election_id AND c2.is_approved = true
      LEFT JOIN ballots b ON b.candidate_id = c.id AND b.election_id = p.election_id
      WHERE p.election_id = $1
      GROUP BY p.id, p.title, p.display_order, c.id, c.full_name, c.image_url, c.program, c.level
      ORDER BY p.display_order, total_votes DESC
    `, [electionId]);

    const { rows: [stats] } = await pool.query(`
      SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE has_voted) as voted
      FROM students WHERE election_id = $1
    `, [electionId]);

    // Group by position and flag winner
    const positions = {};
    for (const row of results) {
      if (!positions[row.position_id]) {
        positions[row.position_id] = {
          id: row.position_id,
          title: row.position,
          displayOrder: row.display_order,
          isYesNoVote: parseInt(row.position_candidate_count) === 1,
          candidates: []
        };
      }

      const isYesNoPosition = parseInt(row.position_candidate_count) === 1;

      positions[row.position_id].candidates.push({
        id: row.candidate_id,
        fullName: row.candidate,
        imageUrl: row.image_url,
        program: row.program,
        level: row.level,
        votes: isYesNoPosition ? row.yes_votes : row.total_votes,
        yesVotes: row.yes_votes,
        noVotes: row.no_votes,
        totalVotes: row.total_votes,
        isYesNoVote: isYesNoPosition,
        percentage: 0,
        isWinner: false,
        isElected: false
      });
    }

    // Mark winners correctly
    Object.values(positions).forEach((pos) => {
      if (pos.candidates.length === 0) return;

      if (pos.isYesNoVote) {
        // YES/NO position — winner only if YES > NO
        const candidate = pos.candidates[0];
        const totalCast = candidate.yesVotes + candidate.noVotes;
        candidate.percentage = totalCast > 0
          ? parseFloat(((candidate.yesVotes / totalCast) * 100).toFixed(1))
          : 0;
        candidate.noPercentage = totalCast > 0
          ? parseFloat(((candidate.noVotes / totalCast) * 100).toFixed(1))
          : 0;
        // Only elected if YES votes strictly greater than NO votes
        candidate.isWinner = candidate.yesVotes > candidate.noVotes && candidate.yesVotes > 0;
        candidate.isElected = candidate.isWinner;
        candidate.result = candidate.isWinner ? 'ELECTED' : 'NOT ELECTED';
      } else {
        // Normal multi-candidate position
        const totalVotes = pos.candidates.reduce((sum, c) => sum + c.votes, 0);
        const max = Math.max(...pos.candidates.map((c) => c.votes));
        const topCandidates = pos.candidates.filter((c) => c.votes === max && max > 0);
        const isTie = topCandidates.length > 1;

        pos.candidates.forEach((c) => {
          c.percentage = totalVotes > 0
            ? parseFloat(((c.votes / totalVotes) * 100).toFixed(1))
            : 0;
          if (isTie && c.votes === max && max > 0) {
            c.isWinner = false;
            c.isTied = true;
          } else {
            c.isWinner = c.votes === max && max > 0;
            c.isTied = false;
          }
        });

        // Flag the position itself as having a tie so frontend can show a notice
        pos.hasTie = isTie;
        pos.tiedCandidates = isTie ? topCandidates.map((c) => c.fullName) : [];
      }
    });

    return res.json({
      election,
      positions: Object.values(positions).sort((a, b) => a.displayOrder - b.displayOrder),
      stats: {
        totalStudents: parseInt(stats.total),
        totalVoted: parseInt(stats.voted),
        turnoutPercentage: stats.total > 0 ? ((stats.voted / stats.total) * 100).toFixed(1) : '0'
      }
    });

  } catch (err) {
    logger.error('Results error:', err);
    return res.status(500).json({ error: 'Failed to load results' });
  }
});

// ============================================================
// EXPORT RESULTS AS PDF
// ============================================================

router.get('/:electionId/pdf', async (req, res) => {
  const { electionId } = req.params;

  try {
    const { rows: [election] } = await pool.query('SELECT * FROM elections WHERE id = $1', [electionId]);
    if (!election) return res.status(404).json({ error: 'Election not found' });

    // Same rule as the JSON results route: admins can view pre-publish only
    // for elections they're assigned to; everyone else needs official release.
    const isAuthorizedAdmin = await isAuthorizedAdminForElection(req, electionId);

    if (!isAuthorizedAdmin && election.status !== 'results_published') {
      return res.status(403).json({ error: 'Results have not been officially released yet' });
    }

    const { rows: results } = await pool.query(`
SELECT p.title as position, c.full_name as candidate,
  COUNT(b.id) as total_votes,
  COUNT(b.id) FILTER (WHERE b.ballot_token NOT LIKE 'NO_%') as yes_votes,
  COUNT(b.id) FILTER (WHERE b.ballot_token LIKE 'NO_%') as no_votes,
  (SELECT COUNT(*) FROM candidates c3 WHERE c3.position_id = p.id AND c3.election_id = p.election_id AND c3.is_approved = true) as position_candidate_count
FROM positions p
JOIN candidates c ON c.position_id = p.id AND c.election_id = p.election_id AND c.is_approved = true
LEFT JOIN ballots b ON b.candidate_id = c.id AND b.election_id = p.election_id
WHERE p.election_id = $1
GROUP BY p.id, p.title, p.display_order, c.id, c.full_name
ORDER BY p.display_order, yes_votes DESC
    `, [electionId]);

    const doc = new PDFDocument({ margin: 50 });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="election-results-${electionId}.pdf"`);
    doc.pipe(res);

    doc.fontSize(20).text('DEPARTMENTAL SMART ELECTION SYSTEM', { align: 'center' });
    doc.fontSize(16).text(election.title, { align: 'center' });
    doc.fontSize(12).text(`Generated: ${new Date().toLocaleString()}`, { align: 'center' });
    doc.moveDown(2);

    let currentPosition = '';
    for (const row of results) {
      if (row.position !== currentPosition) {
        doc.moveDown().fontSize(14).fillColor('#00aa55').text(row.position.toUpperCase());
        currentPosition = row.position;
        doc.fillColor('black');
      }
      const isYesNo = parseInt(row.position_candidate_count) === 1;
      if (isYesNo) {
        const elected = parseInt(row.yes_votes) > parseInt(row.no_votes);
        doc.fontSize(11).text(
          `  ${row.candidate} — YES: ${row.yes_votes} | NO: ${row.no_votes} — ${elected ? 'ELECTED ✓' : 'NOT ELECTED ✗'}`
        );
      } else {
        doc.fontSize(11).text(`  ${row.candidate} — ${row.total_votes} votes`);
      }
    }

    doc.end();
  } catch (err) {
    logger.error('PDF export error:', err);
    res.status(500).json({ error: 'Failed to generate PDF' });
  }
});

module.exports = router;
