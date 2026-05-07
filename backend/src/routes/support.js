const express = require('express');
const router = express.Router();
const { pool } = require('../config/database');
const { authenticateStudent, authenticateAdmin } = require('../middleware/auth');

// Student submits ticket
router.post('/', authenticateStudent, async (req, res) => {
  const { category, subject, description } = req.body;
  if (!category || !subject || !description) return res.status(400).json({ error: 'All fields required' });

  const { rows } = await pool.query(
    'INSERT INTO support_tickets (election_id, student_id, category, subject, description) VALUES ($1, $2, $3, $4, $5) RETURNING *',
    [req.student.election_id, req.student.id, category, subject, description]
  );
  res.status(201).json(rows[0]);
});

// Student views their tickets
router.get('/my', authenticateStudent, async (req, res) => {
  const { rows } = await pool.query(
    'SELECT * FROM support_tickets WHERE student_id = $1 ORDER BY created_at DESC',
    [req.student.id]
  );
  res.json(rows);
});

// Admin views all tickets
router.get('/admin', authenticateAdmin, async (req, res) => {
  const { rows } = await pool.query(
    `SELECT t.*, s.full_name as student_name, s.reference_number 
     FROM support_tickets t LEFT JOIN students s ON s.id = t.student_id 
     ORDER BY t.created_at DESC`
  );
  res.json(rows);
});

// Admin updates ticket status
router.patch('/:id', authenticateAdmin, async (req, res) => {
  const { status, assignedTo } = req.body;
  const { rows } = await pool.query(
    `UPDATE support_tickets SET status = COALESCE($1, status), assigned_to = COALESCE($2, assigned_to),
     resolved_by = CASE WHEN $1 = 'resolved' THEN $3 ELSE resolved_by END,
     resolved_at = CASE WHEN $1 = 'resolved' THEN NOW() ELSE resolved_at END,
     updated_at = NOW() WHERE id = $4 RETURNING *`,
    [status, assignedTo, req.admin.id, req.params.id]
  );
  res.json(rows[0]);
});

module.exports = router;
