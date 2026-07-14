// services/audit.js
const { pool } = require('../config/database');
const logger = require('../utils/logger');

async function log({ action, actorType, actorId, actorEmail, electionId, metadata, ip, userAgent }) {
  try {
    await pool.query(
      `INSERT INTO audit_logs (action, actor_type, actor_id, actor_email, election_id, metadata, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [action, actorType, actorId, actorEmail, electionId, JSON.stringify(metadata || {}), ip, userAgent]
    );
  } catch (err) {
    logger.error('Audit log error:', err);
  }
}

module.exports = { log };
