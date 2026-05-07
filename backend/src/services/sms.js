const logger = require('../utils/logger');

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
  const message = `SMART ELECTION: Your verification code is ${code}. Valid for 10 minutes. Do not share.`;

  try {
    // Try Africa's Talking first (better for Ghana)
    if (process.env.AT_API_KEY) {
      await sendViaAfricasTalking(phone, message);
    } else if (process.env.TWILIO_ACCOUNT_SID) {
      await sendViaTwilio(phone, message);
    } else {
      // Development: log OTP to console
      logger.warn(`[DEV MODE] OTP for ${phone}: ${code}`);
    }
    logger.info(`OTP SMS sent to ${phone.slice(-4)}`);
  } catch (err) {
    logger.error('SMS send failed:', err);
    throw new Error('Failed to send SMS. Please try email verification.');
  }
}

module.exports = { sendOTPSMS };
