// routes/candidate.js
const express = require('express');
const router = express.Router();
const { pool } = require('../config/database');

// Public candidate list for a specific election (only approved ones)
router.get('/election/:electionId', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT c.id, c.full_name, c.image_url, c.bio, c.program, c.level,
              p.id as position_id, p.title as position_title, p.display_order
       FROM candidates c
       JOIN positions p ON p.id = c.position_id
       WHERE c.election_id = $1 AND c.is_approved = true
       ORDER BY p.display_order, c.display_order`,
      [req.params.electionId]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to load candidates' });
  }
});

module.exports = router;
