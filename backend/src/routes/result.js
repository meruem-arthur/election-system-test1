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
        COALESCE(c2.cnt, 0) as position_candidate_count
      FROM positions p
      JOIN candidates c ON c.position_id = p.id AND c.election_id = p.election_id AND c.is_approved = true
      LEFT JOIN (
        SELECT position_id, COUNT(*) as cnt FROM candidates WHERE is_approved = true GROUP BY position_id
      ) c2 ON c2.position_id = p.id
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
      SELECT 
        p.id as position_id,
        p.title as position,
        p.display_order,
        c.id as candidate_id,
        c.full_name as candidate,
        COUNT(b.id)::integer as total_votes,
        COUNT(b.id) FILTER (WHERE b.ballot_token NOT LIKE 'NO_%')::integer as yes_votes,
        COUNT(b.id) FILTER (WHERE b.ballot_token LIKE 'NO_%')::integer as no_votes,
        COALESCE(c2.cnt, 0) as position_candidate_count
      FROM positions p
      JOIN candidates c ON c.position_id = p.id AND c.election_id = p.election_id AND c.is_approved = true
      LEFT JOIN (
        SELECT position_id, COUNT(*) as cnt FROM candidates WHERE is_approved = true GROUP BY position_id
      ) c2 ON c2.position_id = p.id
      LEFT JOIN ballots b ON b.candidate_id = c.id AND b.election_id = p.election_id
      WHERE p.election_id = $1
      GROUP BY p.id, p.title, p.display_order, c.id, c.full_name
      ORDER BY p.display_order, total_votes DESC
    `, [electionId]);

    // Group rows into positions, compute percentages and winners
    const positions = {};
    for (const row of results) {
      if (!positions[row.position_id]) {
        positions[row.position_id] = {
          title: row.position,
          displayOrder: row.display_order,
          isYesNo: parseInt(row.position_candidate_count) === 1,
          candidates: []
        };
      }
      positions[row.position_id].candidates.push({
        name: row.candidate,
        totalVotes: row.total_votes,
        yesVotes: row.yes_votes,
        noVotes: row.no_votes
      });
    }

    const orderedPositions = Object.values(positions).sort((a, b) => a.displayOrder - b.displayOrder);

    orderedPositions.forEach(pos => {
      if (pos.isYesNo) {
        const c = pos.candidates[0];
        const totalCast = c.yesVotes + c.noVotes;
        c.percentage = totalCast > 0 ? ((c.yesVotes / totalCast) * 100).toFixed(0) : 0;
        c.noPercentage = totalCast > 0 ? ((c.noVotes / totalCast) * 100).toFixed(0) : 0;
        c.isWinner = c.yesVotes > c.noVotes && c.yesVotes > 0;
      } else {
        const totalVotes = pos.candidates.reduce((sum, c) => sum + c.totalVotes, 0);
        const max = Math.max(...pos.candidates.map(c => c.totalVotes));
        pos.candidates.forEach(c => {
          c.percentage = totalVotes > 0 ? ((c.totalVotes / totalVotes) * 100).toFixed(0) : 0;
          c.isWinner = c.totalVotes === max && max > 0;
        });
        // Keep the declared winner's line first, like the reference document
        pos.candidates.sort((a, b) => b.totalVotes - a.totalVotes);
      }
    });

    const doc = new PDFDocument({ margin: 60 });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="election-results-${electionId}.pdf"`);
    doc.pipe(res);

    const twoDigitYear = String(new Date(election.created_at).getFullYear()).slice(-2);
    const { rows: [{ seq }] } = await pool.query(
      `SELECT COUNT(*) as seq FROM elections
       WHERE EXTRACT(YEAR FROM created_at) = EXTRACT(YEAR FROM $1::timestamp)
       AND created_at <= $1`,
      [election.created_at]
    );
    const refCode = `GESA/EC/${twoDigitYear}/${String(seq).padStart(3, '0')}`;
    const declaredDate = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });

    // ---- Header block ----
    doc.fontSize(13).font('Helvetica-Bold').text('OFFICE OF THE ELECTORAL COMMISSION', { align: 'center' });
    doc.moveDown(0.8);

    const headerY = doc.y;
    doc.fontSize(9).font('Helvetica').text(`Our Ref: ${refCode}`, 60, headerY);
    doc.text(`Date: ${declaredDate}`, 0, headerY, { align: 'right' });
    doc.moveDown(1);
    doc.moveTo(60, doc.y).lineTo(doc.page.width - 60, doc.y).strokeColor('#999').stroke();
    doc.moveDown(1);

    // ---- Title ----
    doc.fontSize(12).font('Helvetica-Bold').text('PROVISIONAL DECLARATION OF RESULTS', { align: 'center', underline: true });
    doc.moveDown(0.8);
    doc.fontSize(10).font('Helvetica').text(
      `The Electoral Commission hereby announces the provisional results of the "${election.title}" election. ` +
      `Following the successful conduct of the election and completion of the electronic voting process, the results are as follows:`,
      { align: 'left' }
    );
    doc.moveDown(1.2);

    // ---- Results by position ----
    orderedPositions.forEach(pos => {
      doc.fontSize(11).font('Helvetica-Bold').fillColor('black').text(pos.title);
      doc.moveDown(0.2);

      pos.candidates.forEach(c => {
        if (pos.isYesNo) {
          doc.fontSize(10).font('Helvetica')
            .text(`${c.name} — YES: ${c.yesVotes} votes (${c.percentage}%) | NO: ${c.noVotes} votes (${c.noPercentage}%)${c.isWinner ? '  —  ELECTED' : ''}`);
        } else {
          doc.fontSize(10).font('Helvetica')
            .text(`${c.name} — ${c.totalVotes} votes (${c.percentage}%)${c.isWinner ? '  —  ELECTED' : ''}`);
        }
      });
      doc.moveDown(0.8);
    });

    // ---- Closing note ----
    doc.moveDown(0.5);
    doc.fontSize(9).font('Helvetica').text(
      'The Electoral Commission extends its sincere appreciation to all candidates, students, election officials and observers ' +
      'for their cooperation and commitment throughout the electoral process.',
      { align: 'left' }
    );
    doc.moveDown(0.5);
    doc.text(
      'Please note that these are provisional results and remain subject to any valid petitions and verification procedures ' +
      'in accordance with the Electoral Guidelines.',
      { align: 'left' }
    );
    doc.moveDown(0.5);
    doc.text('Congratulations to all candidates, and we thank the entire student community for a peaceful and successful election.');

    // ---- Signature block ----
    doc.moveDown(2.5);
    doc.text('...............................Signed');
    doc.moveDown(0.2);
    doc.font('Helvetica-Bold').text('Election Committee');

    doc.end();
  } catch (err) {
    logger.error('PDF export error:', err);
    res.status(500).json({ error: 'Failed to generate PDF' });
  }
});

module.exports = router;
