const logger = require('../utils/logger');

// ============================================================
// PHONE NORMALIZATION
// ============================================================

// Normalizes Ghanaian numbers to E.164 format (+233XXXXXXXXX)
// Accepts formats like: 0244123456, 244123456, 233244123456, +233244123456,
// and strips spaces, dashes, and parentheses.
function normalizePhone(phone) {
  if (!phone) {
    throw new Error('Phone number is required');
  }

  let cleaned = String(phone).trim().replace(/[\s\-()]/g, '');

  if (cleaned.startsWith('+')) {
    cleaned = '+' + cleaned.slice(1).replace(/\D/g, '');
  } else {
    cleaned = cleaned.replace(/\D/g, '');

    if (cleaned.startsWith('0')) {
      cleaned = '+233' + cleaned.slice(1);
    } else if (cleaned.startsWith('233')) {
      cleaned = '+' + cleaned;
    } else {
      cleaned = '+233' + cleaned;
    }
  }

  if (!/^\+233\d{9}$/.test(cleaned)) {
    throw new Error(`Invalid Ghanaian phone number: ${phone}`);
  }

  return cleaned;
}

// ============================================================
// PROVIDERS — Africa's Talking primary (kept from the existing
// codebase, better Ghana delivery/rates), Twilio fallback.
// NOTE: the phase1 zip replaced this file with a Twilio-only version.
// That would silently stop using Africa's Talking if AT_API_KEY is
// still your active provider in production — kept both here.
// ============================================================

async function sendViaAfricasTalking(phone, message) {
  const AfricasTalking = require('africastalking');
  const at = AfricasTalking({
    apiKey: process.env.AT_API_KEY,
    username: process.env.AT_USERNAME
  });
  const sms = at.SMS;
  await sms.send({
    to: [phone],
    message,
    from: process.env.AT_SENDER_ID || 'ELECTION'
  });
  return null; // AT doesn't support the same delivery-status webhook as Twilio
}

async function sendViaTwilio(phone, message) {
  const twilio = require('twilio');
  const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
  const params = {
    body: message,
    from: process.env.TWILIO_PHONE_NUMBER,
    to: phone
  };
  // Phase 2: Twilio POSTs delivery status (queued/sent/delivered/failed/
  // undelivered) to this URL if configured. Safe to leave unset — sendSMS
  // still works, you just won't get delivery confirmation, only "handed off".
  if (process.env.TWILIO_STATUS_CALLBACK_URL) {
    params.statusCallback = process.env.TWILIO_STATUS_CALLBACK_URL;
  }
  const result = await client.messages.create(params);
  return result.sid;
}

async function sendSMS(phone, message) {
  const normalizedPhone = normalizePhone(phone);

  if (process.env.AT_API_KEY) {
    return await sendViaAfricasTalking(normalizedPhone, message);
  } else if (process.env.TWILIO_ACCOUNT_SID) {
    return await sendViaTwilio(normalizedPhone, message);
  } else {
    logger.warn(`[DEV MODE] SMS to ${normalizedPhone}: ${message}`);
    return null;
  }
}

// ============================================================
// OTP SMS
// ============================================================

async function sendOTPSMS(phone, code) {
  const normalizedPhone = normalizePhone(phone);
  const message = `SMART ELECTION: Your verification code is ${code}. Valid for 10 minutes. Do not share.`;

  try {
    const sid = await sendSMS(normalizedPhone, message);
    logger.info(`OTP SMS sent to ${normalizedPhone.slice(-4)}`);
    return sid;
  } catch (err) {
    logger.error('OTP SMS send failed:', err);
    throw new Error('Failed to send SMS. Please try email verification.');
  }
}

// ============================================================
// CREDENTIALS SMS (temp password broadcast / regeneration)
//
// IMPORTANT: reference number is included — it's the student's LOGIN
// (username). The phase1 zip's replacement dropped it from the message
// entirely and sent only the password + a login link, which would leave
// students unable to log in without separately knowing their reference
// number. Restored here.
// ============================================================

async function sendCredentialsSMS(phone, fullName, referenceNumber, tempPassword, loginUrl) {
  const normalizedPhone = normalizePhone(phone);
  const message = `SMART ELECTION: Hi ${fullName}, Ref No: ${referenceNumber} | Password: ${tempPassword}. Login at ${loginUrl}. You'll set a new password on first login. Do not share this.`;

  try {
    const sid = await sendSMS(normalizedPhone, message);
    logger.info(`Credentials SMS sent to ${normalizedPhone.slice(-4)}`);
    return sid;
  } catch (err) {
    logger.error('Credentials SMS send failed:', err);
    throw err; // let the caller (credentialDispatch service) record the failure
  }
}

module.exports = { sendOTPSMS, sendCredentialsSMS, normalizePhone };
