const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { pool } = require('../config/database');
const logger = require('../utils/logger');

function generateOTPCode(length = 6) {
  const digits = '0123456789';
  let code = '';
  const randomBytes = crypto.randomBytes(length);
  for (let i = 0; i < length; i++) {
    code += digits[randomBytes[i] % digits.length];
  }
  return code;
}

function maskDestination(value, type) {
  if (type === 'email') {
    const [local, domain] = value.split('@');
    return `${local.slice(0, 2)}***@${domain}`;
  }
  if (type === 'sms') {
    return `****${value.slice(-4)}`;
  }
  return '****';
}

async function sendOTP(student) {
  const code = generateOTPCode(parseInt(process.env.OTP_LENGTH) || 6);
  const codeHash = await bcrypt.hash(code, 8);
  const expiresAt = new Date(Date.now() + (parseInt(process.env.OTP_EXPIRY_MINUTES) || 10) * 60 * 1000);

  // Invalidate old OTPs for this student
  await pool.query(
    'UPDATE otp_codes SET is_used = true WHERE student_id = $1 AND is_used = false',
    [student.id]
  );

  // Send via BOTH email and SMS whenever both are available — students often
  // give a wrong/unused email but always have their phone, so SMS guarantees delivery.
  // The otp_codes.channel column only accepts 'sms' or 'email' (DB constraint),
  // so we insert one row per channel rather than a combined string.
  const rowsToInsert = [];
  let emailDestination = null;
  let smsDestination = null;
  let emailMasked = null;
  let smsMasked = null;

  if (student.school_email) {
    emailDestination = student.school_email;
    emailMasked = maskDestination(emailDestination, 'email');
    rowsToInsert.push({ channel: 'email', sentTo: emailDestination });
  }
  if (student.phone_number) {
    smsDestination = student.phone_number;
    smsMasked = maskDestination(smsDestination, 'sms');
    rowsToInsert.push({ channel: 'sms', sentTo: smsDestination });
  }

  // Fallback: neither email nor phone on file — still record something so
  // verifyOTP has a row to check against (console/dev-only testing)
  if (rowsToInsert.length === 0) {
    rowsToInsert.push({ channel: 'email', sentTo: 'console' });
  }

  const channel = rowsToInsert.map(r => r.channel).join('+');
  const maskedDestination = [emailMasked, smsMasked].filter(Boolean).join(', ') || 'console (dev mode)';

  // Store one OTP row per channel — all share the same code_hash so the
  // student can verify with the single code they received on either channel
  for (const row of rowsToInsert) {
    await pool.query(
      `INSERT INTO otp_codes (student_id, code_hash, purpose, channel, sent_to, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [student.id, codeHash, 'first_login', row.channel, row.sentTo, expiresAt]
    );
  }

  // ALWAYS print clearly to console for local testing
  console.log('\n' + '='.repeat(52));
  console.log('  OTP CODE FOR TESTING');
  console.log('='.repeat(52));
  console.log('  Student : ' + student.full_name);
  console.log('  Ref No  : ' + student.reference_number);
  console.log('  OTP Code: \x1b[32m\x1b[1m' + code + '\x1b[0m  <-- USE THIS');
  console.log('='.repeat(52) + '\n');

  // Try sending via email AND SMS independently — one failing should never
  // block or skip the other, since each is a separate delivery channel
  if (emailDestination) {
    try {
      const emailService = require('./email');
      await emailService.sendOTPEmail(emailDestination, student.full_name, code);
      logger.info('OTP email sent to ' + emailMasked);
    } catch (err) {
      logger.warn('OTP email failed — use the code printed in console above');
      logger.error('OTP email error detail: ' + (err && err.message ? err.message : err));
      if (err && err.code) logger.error('OTP email error code: ' + err.code);
      if (err && err.response) logger.error('OTP email SMTP response: ' + err.response);
    }
  }

  if (smsDestination) {
    try {
      const smsService = require('./sms');
      await smsService.sendOTPSMS(smsDestination, code);
      logger.info('OTP SMS sent to ' + smsMasked);
    } catch (err) {
      logger.warn('OTP SMS failed — use the code printed in console above');
      logger.error('OTP SMS error detail: ' + (err && err.message ? err.message : err));
      if (err && err.code) logger.error('OTP SMS error code: ' + err.code);
      if (err && err.moreInfo) logger.error('OTP SMS Twilio info: ' + err.moreInfo);
    }
  }

  return { channel, maskedDestination };
}

async function verifyOTP(studentId, code) {
  // A single sendOTP() call may have inserted multiple rows (one per channel,
  // e.g. email + sms) that all share the same code_hash and expiry. Fetch all
  // currently-active rows for this student so we can verify against any of them
  // and keep them in sync (mark all used / increment attempts together).
  const { rows } = await pool.query(
    `SELECT * FROM otp_codes 
     WHERE student_id = $1 AND is_used = false AND expires_at > NOW()
     ORDER BY created_at DESC`,
    [studentId]
  );

  if (!rows[0]) {
    return { success: false, error: 'OTP expired or not found. Please request a new one.' };
  }

  // All active rows from the same sendOTP() call share the same code_hash —
  // group by created_at batch using the most recent code_hash as the active one
  const latestHash = rows[0].code_hash;
  const activeBatch = rows.filter(r => r.code_hash === latestHash);
  const maxAttempts = Math.max(...activeBatch.map(r => r.attempts));

  if (maxAttempts >= 5) {
    await pool.query(
      'UPDATE otp_codes SET is_used = true WHERE student_id = $1 AND code_hash = $2',
      [studentId, latestHash]
    );
    return { success: false, error: 'Too many failed attempts. Request a new OTP.' };
  }

  const valid = await bcrypt.compare(code, latestHash);

  if (!valid) {
    await pool.query(
      'UPDATE otp_codes SET attempts = attempts + 1 WHERE student_id = $1 AND code_hash = $2',
      [studentId, latestHash]
    );
    const remaining = 5 - (maxAttempts + 1);
    return { success: false, error: `Invalid code. ${remaining} attempt(s) remaining.` };
  }

  // Correct code — mark every row in this batch (email row, sms row, etc.) as used
  await pool.query(
    'UPDATE otp_codes SET is_used = true, verified_at = NOW() WHERE student_id = $1 AND code_hash = $2',
    [studentId, latestHash]
  );

  return { success: true };
}

module.exports = { sendOTP, verifyOTP };
