const express = require('express');
const router = express.Router();
const { pool } = require('../config/database');
const { authenticateAdmin } = require('../middleware/auth');

router.use(authenticateAdmin);

router.get('/', async (req, res) => {
  const { electionId, action, page = 1, limit = 100 } = req.query;
  const offset = (page - 1) * limit;
  let conditions = [];
  let params = [];
  const isSuperAdmin = req.admin.role === 'super_admin';

  if (!isSuperAdmin) {
    // Non-super_admins only ever see logs for elections they're actually
    // assigned to — never the full system-wide trail, and never other
    // departments' logs.
    const { rows: assigned } = await pool.query(
      'SELECT election_id FROM admin_election_assignments WHERE admin_id = $1',
      [req.admin.id]
    );
    const assignedIds = assigned.map(r => r.election_id);

    if (electionId) {
      if (!assignedIds.includes(electionId)) {
        return res.status(403).json({ error: 'You are not assigned to this election' });
      }
      conditions.push(`election_id = $${params.length + 1}`);
      params.push(electionId);
    } else {
      if (assignedIds.length === 0) {
        return res.json([]);
      }
      conditions.push(`election_id = ANY($${params.length + 1}::uuid[])`);
      params.push(assignedIds);
    }
  } else if (electionId) {
    conditions.push(`election_id = $${params.length + 1}`);
    params.push(electionId);
  }

  if (action) { conditions.push(`action = $${params.length + 1}`); params.push(action); }

  const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
  const { rows } = await pool.query(
    `SELECT * FROM audit_logs ${where} ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limit, offset]
  );
  res.json(rows);
});

module.exports = router;
