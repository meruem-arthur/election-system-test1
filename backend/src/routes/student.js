// routes/student.js — Student self-service
const express = require('express');
const router = express.Router();
const { pool } = require('../config/database');
const { authenticateStudent, requireVerified } = require('../middleware/auth');

// Get student profile + election info
router.get('/profile', authenticateStudent, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT s.id, s.full_name, s.reference_number, s.index_number, s.level, 
              s.program, s.department, s.has_voted, s.voted_at, s.is_verified,
              e.title as election_title, e.status as election_status,
              e.start_time, e.end_time, e.results_published_at
       FROM students s 
       JOIN elections e ON s.election_id = e.id
       WHERE s.id = $1`,
      [req.student.id]
    );
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to get profile' });
  }
});

// Check if student has voted
router.get('/vote-status', authenticateStudent, requireVerified, async (req, res) => {
  const { rows } = await pool.query(
    'SELECT has_voted, voted_at FROM students WHERE id = $1',
    [req.student.id]
  );
  res.json({ hasVoted: rows[0]?.has_voted, votedAt: rows[0]?.voted_at });
});

module.exports = router;
