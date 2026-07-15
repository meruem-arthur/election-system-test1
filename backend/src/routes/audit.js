const express = require('express');
const router = express.Router();
const { pool } = require('../config/database');
const { authenticateAdmin } = require('../middleware/auth');

router.use(authenticateAdmin);

// ============================================================
// Shared scoping + filter logic — used by both the list route and
// the CSV export route, so the two can never drift apart (e.g. export
// accidentally leaking logs a non-super_admin isn't scoped to see).
// Returns { where, params } ready to drop into a query, or a flag
// telling the caller to short-circuit (forbidden / empty) instead.
// ============================================================
async function buildAuditQuery(admin, query) {
  const { electionId, action, from, to } = query;
  const conditions = [];
  const params = [];
  const isSuperAdmin = admin.role === 'super_admin';

  if (!isSuperAdmin) {
    // Non-super_admins only ever see logs for elections they're actually
    // assigned to — never the full system-wide trail, and never other
    // departments' logs.
    const { rows: assigned } = await pool.query(
      'SELECT election_id FROM admin_election_assignments WHERE admin_id = $1',
      [admin.id]
    );
    const assignedIds = assigned.map(r => r.election_id);

    if (electionId) {
      if (!assignedIds.includes(electionId)) {
        return { forbidden: true };
      }
      conditions.push(`election_id = $${params.length + 1}`);
      params.push(electionId);
    } else {
      if (assignedIds.length === 0) {
        return { empty: true };
      }
      conditions.push(`election_id = ANY($${params.length + 1}::uuid[])`);
      params.push(assignedIds);
    }
  } else if (electionId) {
    conditions.push(`election_id = $${params.length + 1}`);
    params.push(electionId);
  }

  if (action) {
    conditions.push(`action = $${params.length + 1}`);
    params.push(action);
  }

  // Date range — `from` is inclusive of the whole day, `to` is inclusive
  // through end of that day, so "from=2026-07-01&to=2026-07-01" returns
  // that entire day rather than nothing (a bare date parses as midnight).
  if (from) {
    conditions.push(`created_at >= $${params.length + 1}`);
    params.push(new Date(`${from}T00:00:00.000Z`));
  }
  if (to) {
    conditions.push(`created_at <= $${params.length + 1}`);
    params.push(new Date(`${to}T23:59:59.999Z`));
  }

  const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
  return { where, params };
}

router.get('/', async (req, res) => {
  const { page = 1, limit = 100 } = req.query;
  const offset = (page - 1) * limit;

  const result = await buildAuditQuery(req.admin, req.query);
  if (result.forbidden) return res.status(403).json({ error: 'You are not assigned to this election' });
  if (result.empty) return res.json([]);

  const { where, params } = result;
  const { rows } = await pool.query(
    `SELECT * FROM audit_logs ${where} ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limit, offset]
  );
  res.json(rows);
});

// ============================================================
// CSV export — same scoping/filters as the list view, no LIMIT, so an
// admin can pull a full offline copy of exactly what they're looking at
// (e.g. to hand over for independent verification). This is read-only:
// it exports a copy, it never touches audit_logs itself. There is
// intentionally no delete/clear route anywhere in this file — the
// audit trail is permanent, including for super_admins.
// ============================================================
router.get('/export', async (req, res) => {
  const result = await buildAuditQuery(req.admin, req.query);
  if (result.forbidden) return res.status(403).json({ error: 'You are not assigned to this election' });
  if (result.empty) {
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="audit-log.csv"');
    return res.send('timestamp,action,actor_type,actor_email,election_id,ip_address,details\n');
  }

  const { where, params } = result;
  const { rows } = await pool.query(
    `SELECT * FROM audit_logs ${where} ORDER BY created_at DESC`,
    params
  );

  const escape = (val) => {
    if (val === null || val === undefined) return '';
    const str = typeof val === 'object' ? JSON.stringify(val) : String(val);
    // Quote any field containing a comma, quote, or newline; double up
    // internal quotes per standard CSV escaping.
    return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
  };

  const header = 'timestamp,action,actor_type,actor_email,actor_id,election_id,ip_address,details';
  const lines = rows.map(log => [
    escape(new Date(log.created_at).toISOString()),
    escape(log.action),
    escape(log.actor_type),
    escape(log.actor_email),
    escape(log.actor_id),
    escape(log.election_id),
    escape(log.ip_address),
    escape(log.metadata),
  ].join(','));

  const csv = [header, ...lines].join('\n');
  const stamp = new Date().toISOString().slice(0, 10);

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="audit-log-${stamp}.csv"`);
  res.send(csv);
});

module.exports = router;
