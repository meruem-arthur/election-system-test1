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

  // Determine channel — prefer email, fallback to SMS, fallback to console-only
  let channel = 'console';
  let destination = 'console';
  let maskedDestination = 'console (dev mode)';

  if (student.school_email) {
    channel = 'email';
    destination = student.school_email;
    maskedDestination = maskDestination(destination, 'email');
  } else if (student.phone_number) {
    channel = 'sms';
    destination = student.phone_number;
    maskedDestination = maskDestination(destination, 'sms');
  }

  // Store OTP
  await pool.query(
    `INSERT INTO otp_codes (student_id, code_hash, purpose, channel, sent_to, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [student.id, codeHash, 'first_login', channel, destination, expiresAt]
  );

  // ALWAYS print clearly to console for local testing
  console.log('\n' + '='.repeat(52));
  console.log('  OTP CODE FOR TESTING');
  console.log('='.repeat(52));
  console.log('  Student : ' + student.full_name);
  console.log('  Ref No  : ' + student.reference_number);
  console.log('  OTP Code: \x1b[32m\x1b[1m' + code + '\x1b[0m  <-- USE THIS');
  console.log('='.repeat(52) + '\n');

  // Try sending via email/SMS — silently skip if not configured
  if (channel === 'email') {
    try {
      const emailService = require('./email');
      await emailService.sendOTPEmail(destination, student.full_name, code);
      logger.info('OTP email sent to ' + maskedDestination);
    } catch (err) {
      logger.warn('OTP email failed — use the code printed in console above');
      logger.error('OTP email error detail: ' + (err && err.message ? err.message : err));
      if (err && err.code) logger.error('OTP email error code: ' + err.code);
      if (err && err.response) logger.error('OTP email SMTP response: ' + err.response);
    }
  } else if (channel === 'sms') {
    try {
      const smsService = require('./sms');
      await smsService.sendOTPSMS(destination, code);
      logger.info('OTP SMS sent to ' + maskedDestination);
    } catch (err) {
      logger.warn('OTP SMS failed — use the code printed in console above');
    }
  }

  return { channel, maskedDestination };
}

async function verifyOTP(studentId, code) {
  const { rows } = await pool.query(
    `SELECT * FROM otp_codes 
     WHERE student_id = $1 AND is_used = false AND expires_at > NOW()
     ORDER BY created_at DESC LIMIT 1`,
    [studentId]
  );

  if (!rows[0]) {
    return { success: false, error: 'OTP expired or not found. Please request a new one.' };
  }

  const otp = rows[0];

  if (otp.attempts >= 5) {
    await pool.query('UPDATE otp_codes SET is_used = true WHERE id = $1', [otp.id]);
    return { success: false, error: 'Too many failed attempts. Request a new OTP.' };
  }

  const valid = await bcrypt.compare(code, otp.code_hash);

  if (!valid) {
    await pool.query('UPDATE otp_codes SET attempts = attempts + 1 WHERE id = $1', [otp.id]);
    const remaining = 5 - (otp.attempts + 1);
    return { success: false, error: `Invalid code. ${remaining} attempt(s) remaining.` };
  }

  await pool.query(
    'UPDATE otp_codes SET is_used = true, verified_at = NOW() WHERE id = $1',
    [otp.id]
  );

  return { success: true };
}

module.exports = { sendOTP, verifyOTP };
