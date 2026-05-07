// routes/election.js — Public election info
const express = require('express');
const router = express.Router();
const { pool } = require('../config/database');

router.get('/:id/status', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, title, status, start_time, end_time, department FROM elections WHERE id = $1',
      [req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Election not found' });

    // Auto-close expired elections
    const election = rows[0];
    if (election.status === 'active' && election.end_time && new Date(election.end_time) < new Date()) {
      await pool.query('UPDATE elections SET status = $1 WHERE id = $2', ['ended', election.id]);
      election.status = 'ended';
    }

    res.json(election);
  } catch (err) {
    res.status(500).json({ error: 'Failed to get election status' });
  }
});

module.exports = router;
