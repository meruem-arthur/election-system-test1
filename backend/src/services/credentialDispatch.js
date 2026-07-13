const bcrypt = require('bcryptjs');
const { pool, withTransaction } = require('../config/database');
const { generateTempPassword } = require('../utils/password');
const emailService = require('./email');
const smsService = require('./sms');
const auditService = require('./audit');
const logger = require('../utils/logger');

const MAX_ATTEMPTS = 5;
const BATCH_SIZE = 15;
const LOGIN_URL = process.env.FRONTEND_URL || 'http://localhost:3000';

// ============================================================
// ENQUEUE — bulk-queue students for credential dispatch
// ============================================================
//
// Default filter: is_first_login = true. That's the same signal the
// single-student regenerate-credentials route already uses to refuse
// touching an account where the student has completed their own
// password change — so this can never be used to hijack an active
// account, same guarantee as the single-student path.
async function enqueueForElection({ electionId, adminId, studentIds = null }) {
  const params = [electionId];
  let studentFilter = '';
  if (Array.isArray(studentIds) && studentIds.length > 0) {
    params.push(studentIds);
    studentFilter = ' AND id = ANY($2)';
  }

  const { rows: candidates } = await pool.query(
    `SELECT id, school_email, phone_number FROM students
     WHERE election_id = $1 AND is_first_login = true${studentFilter}`,
    params
  );

  let queued = 0, blockedNoContact = 0, alreadyQueued = 0;

  for (const student of candidates) {
    const hasEmail = !!student.school_email;
    const hasPhone = !!student.phone_number;
    const blocked = !hasEmail && !hasPhone;

    const { rowCount } = await pool.query(
      `INSERT INTO credential_dispatch
         (student_id, election_id, email_status, sms_status, blocked_no_contact, requested_by)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (student_id) WHERE blocked_no_contact = false
         AND (email_status = 'pending' OR sms_status = 'pending')
       DO NOTHING`,
      [
        student.id,
        electionId,
        hasEmail ? 'pending' : 'skipped',
        hasPhone ? 'pending' : 'skipped',
        blocked,
        adminId
      ]
    );

    if (rowCount === 0) alreadyQueued++;
    else if (blocked) blockedNoContact++;
    else queued++;
  }

  if (queued > 0) {
    // Kick the worker immediately instead of waiting for the next tick —
    // fire and forget, errors are logged inside processBatch itself.
    processBatch().catch(err => logger.error('Credential dispatch kick-off failed:', err));
  }

  return { totalCandidates: candidates.length, queued, blockedNoContact, alreadyQueued };
}

// ============================================================
// PROCESS ONE ROW
// ============================================================

async function processOne(row) {
  const { rows: studentRows } = await pool.query(
    'SELECT * FROM students WHERE id = $1', [row.student_id]
  );
  const student = studentRows[0];
  if (!student) {
    await pool.query(
      `UPDATE credential_dispatch SET email_status = 'failed', sms_status = 'failed',
       email_error = 'Student no longer exists', sms_error = 'Student no longer exists'
       WHERE id = $1`,
      [row.id]
    );
    return;
  }

  // Generate the password ONCE per dispatch row and hold it in
  // pending_plaintext until fully resolved, so retries of one channel
  // never desync from a channel that already succeeded.
  let plaintext = row.pending_plaintext;
  if (!plaintext) {
    plaintext = generateTempPassword();
    const hash = await bcrypt.hash(plaintext, parseInt(process.env.BCRYPT_ROUNDS) || 12);
    await withTransaction(async (client) => {
      await client.query(
        'UPDATE students SET password_hash = $1, is_first_login = true, is_verified = false WHERE id = $2',
        [hash, student.id]
      );
      await client.query(
        'UPDATE credential_dispatch SET pending_plaintext = $1 WHERE id = $2',
        [plaintext, row.id]
      );
    });
  }

  let emailStatus = row.email_status, emailError = row.email_error;
  let smsStatus = row.sms_status, smsError = row.sms_error;

  if (emailStatus === 'pending') {
    try {
      await emailService.sendCredentialsEmail(student.school_email, student.full_name, student.reference_number, plaintext, `${LOGIN_URL}/login`);
      emailStatus = 'sent';
      emailError = null;
    } catch (err) {
      emailError = err.message;
      logger.warn(`Credential email failed for student ${student.id}: ${err.message}`);
    }
  }

  let smsMessageSid = row.sms_message_sid || null;

  if (smsStatus === 'pending') {
    try {
      smsMessageSid = await smsService.sendCredentialsSMS(student.phone_number, student.full_name, student.reference_number, plaintext, `${LOGIN_URL}/login`);
      smsStatus = 'sent';
      smsError = null;
    } catch (err) {
      smsError = err.message;
      logger.warn(`Credential SMS failed for student ${student.id}: ${err.message}`);
    }
  }

  const attempts = row.attempts + 1;
  const stillPending = emailStatus === 'pending' || smsStatus === 'pending';
  const givingUp = stillPending && attempts >= MAX_ATTEMPTS;

  if (givingUp) {
    if (emailStatus === 'pending') { emailStatus = 'failed'; emailError = emailError || 'Max attempts reached'; }
    if (smsStatus === 'pending') { smsStatus = 'failed'; smsError = smsError || 'Max attempts reached'; }
  }

  const resolved = emailStatus !== 'pending' && smsStatus !== 'pending';

  await pool.query(
    `UPDATE credential_dispatch
     SET email_status = $1, email_error = $2, sms_status = $3, sms_error = $4,
         attempts = $5, pending_plaintext = $6, sms_message_sid = $7
     WHERE id = $8`,
    [emailStatus, emailError, smsStatus, smsError, attempts, resolved ? null : plaintext, smsMessageSid, row.id]
  );

  if (resolved && (emailStatus === 'sent' || smsStatus === 'sent')) {
    await auditService.log({
      action: 'credentials_dispatched',
      actorType: 'admin',
      actorId: row.requested_by,
      electionId: row.election_id,
      metadata: { studentId: student.id, emailStatus, smsStatus }
    });
  }
}

// ============================================================
// PROCESS A BATCH — safe to call from a timer AND on-demand
// ============================================================

let processing = false;

async function processBatch(limit = BATCH_SIZE) {
  if (processing) return { skipped: true, reason: 'already running' };
  processing = true;
  try {
    // Atomic claim: the subquery's FOR UPDATE SKIP LOCKED + the wrapping
    // UPDATE run as a single statement, so this is safe even if you later
    // scale to multiple backend instances — two instances can never claim
    // the same row. (A bare SELECT ... FOR UPDATE with no surrounding
    // transaction would NOT hold the lock past that one statement, which
    // would make it useless here — this claims by writing, not just reading.)
    // For your current single-instance Render deployment, the in-process
    // `processing` flag above is what actually prevents overlap tick-to-tick;
    // this claim just future-proofs it.
    const { rows } = await pool.query(
      `UPDATE credential_dispatch SET attempts = attempts
       WHERE id IN (
         SELECT id FROM credential_dispatch
         WHERE blocked_no_contact = false
           AND (email_status = 'pending' OR sms_status = 'pending')
         ORDER BY created_at ASC
         LIMIT $1
         FOR UPDATE SKIP LOCKED
       )
       RETURNING *`,
      [limit]
    );
    for (const row of rows) {
      try {
        await processOne(row);
      } catch (err) {
        logger.error(`processOne failed for dispatch row ${row.id}:`, err);
      }
    }
    return { processed: rows.length };
  } finally {
    processing = false;
  }
}

// ============================================================
// RESEND FAILED — admin-triggered retry for an election
// ============================================================

async function resendFailed({ electionId, studentIds = null }) {
  const params = [electionId];
  let filter = '';
  if (Array.isArray(studentIds) && studentIds.length > 0) {
    params.push(studentIds);
    filter = ' AND student_id = ANY($2)';
  }

  // Three cases now feed a retry for SMS specifically:
  //  1. sms_status = 'failed' (we already knew it failed)
  //  2. sms_status = 'sent' but pending_plaintext is NULL (row was fully
  //     resolved, e.g. email side maxed retries) AND processOne is about to
  //     mint a brand new password — resend this channel too so it doesn't
  //     end up holding a stale one.
  //  3. sms_status = 'sent' but Twilio's delivery webhook later confirmed
  //     'undelivered'/'failed' (Phase 2) — Twilio accepted it, but it never
  //     reached the handset. Invisible before Phase 2's webhook existed.
  const smsRetryCondition = `(
    sms_status = 'failed'
    OR (pending_plaintext IS NULL AND sms_status = 'sent')
    OR (sms_status = 'sent' AND sms_delivery_status IN ('undelivered', 'failed'))
  )`;

  const { rows } = await pool.query(
    `UPDATE credential_dispatch
     SET email_status = CASE
           WHEN email_status = 'failed' THEN 'pending'
           WHEN pending_plaintext IS NULL AND email_status = 'sent' THEN 'pending'
           ELSE email_status
         END,
         sms_status = CASE WHEN ${smsRetryCondition} THEN 'pending' ELSE sms_status END,
         sms_message_sid = CASE WHEN ${smsRetryCondition} THEN NULL ELSE sms_message_sid END,
         sms_delivery_status = CASE WHEN ${smsRetryCondition} THEN NULL ELSE sms_delivery_status END,
         sms_delivery_error = CASE WHEN ${smsRetryCondition} THEN NULL ELSE sms_delivery_error END,
         sms_delivered_at = CASE WHEN ${smsRetryCondition} THEN NULL ELSE sms_delivered_at END,
         attempts = 0
     WHERE election_id = $1 AND blocked_no_contact = false
       AND (email_status = 'failed' OR ${smsRetryCondition})${filter}
     RETURNING id`,
    params
  );

  if (rows.length > 0) {
    processBatch().catch(err => logger.error('Credential dispatch kick-off failed:', err));
  }

  return { requeued: rows.length };
}

// ============================================================
// BACKGROUND WORKER — runs continuously while the process is alive
// ============================================================

function startWorker(intervalMs = 5000) {
  setInterval(() => {
    processBatch().catch(err => logger.error('Credential dispatch worker tick failed:', err));
  }, intervalMs);
  logger.info('Credential dispatch background worker started');
}

module.exports = { enqueueForElection, processBatch, resendFailed, startWorker };
