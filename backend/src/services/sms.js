const logger = require('../utils/logger');

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
      // Local format: 0244123456 -> +233244123456
      cleaned = '+233' + cleaned.slice(1);
    } else if (cleaned.startsWith('233')) {
      // Missing plus: 233244123456 -> +233244123456
      cleaned = '+' + cleaned;
    } else {
      // Bare 9-digit subscriber number: 244123456 -> +233244123456
      cleaned = '+233' + cleaned;
    }
  }

  if (!/^\+233\d{9}$/.test(cleaned)) {
    throw new Error(`Invalid Ghanaian phone number: ${phone}`);
  }

  return cleaned;
}

// Africa's Talking SMS (recommended for Ghana)
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
}

// Twilio SMS (fallback)
async function sendViaTwilio(phone, message) {
  const twilio = require('twilio');
  const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
  await client.messages.create({
    body: message,
    from: process.env.TWILIO_PHONE_NUMBER,
    to: phone
  });
}

async function sendOTPSMS(phone, code) {
  const normalizedPhone = normalizePhone(phone);
  const message = `SMART ELECTION: Your verification code is ${code}. Valid for 10 minutes. Do not share.`;

  try {
    // Try Africa's Talking first (better for Ghana)
    if (process.env.AT_API_KEY) {
      await sendViaAfricasTalking(normalizedPhone, message);
    } else if (process.env.TWILIO_ACCOUNT_SID) {
      await sendViaTwilio(normalizedPhone, message);
    } else {
      // Development: log OTP to console
      logger.warn(`[DEV MODE] OTP for ${normalizedPhone}: ${code}`);
    }
    logger.info(`OTP SMS sent to ${normalizedPhone.slice(-4)}`);
  } catch (err) {
    logger.error('SMS send failed:', err);
    throw new Error('Failed to send SMS. Please try email verification.');
  }
}

module.exports = { sendOTPSMS, normalizePhone };
