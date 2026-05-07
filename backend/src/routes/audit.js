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

  if (electionId) { conditions.push(`election_id = $${params.length + 1}`); params.push(electionId); }
  if (action) { conditions.push(`action = $${params.length + 1}`); params.push(action); }

  const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
  const { rows } = await pool.query(
    `SELECT * FROM audit_logs ${where} ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limit, offset]
  );
  res.json(rows);
});

module.exports = router;
