const nodemailer = require('nodemailer');
const logger = require('../utils/logger');

function createTransporter() {
  const port = parseInt(process.env.SMTP_PORT) || 465;
  const secure = port === 465;

  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port,
    secure,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    },
    connectionTimeout: 30000,
    greetingTimeout: 30000,
    socketTimeout: 30000,
    pool: true,
    maxConnections: 3,
    tls: {
      rejectUnauthorized: false
    }
  });
}

async function sendOTPEmail(to, name, code) {
  const transporter = createTransporter();

  const html = `
    <!DOCTYPE html>
    <html>
    <head><style>
      body { font-family: Arial, sans-serif; background: #0a0a0a; color: #fff; margin: 0; padding: 20px; }
      .container { max-width: 500px; margin: auto; background: #111; border: 1px solid #00ff88; border-radius: 12px; padding: 40px; }
      .logo { color: #00ff88; font-size: 20px; font-weight: bold; margin-bottom: 30px; }
      .code { font-size: 42px; font-weight: bold; color: #00ff88; letter-spacing: 8px; text-align: center; padding: 24px; background: #1a1a1a; border-radius: 8px; margin: 20px 0; }
      .footer { color: #666; font-size: 12px; margin-top: 30px; }
    </style></head>
    <body>
      <div class="container">
        <div class="logo">⚡ SMART ELECTION SYSTEM</div>
        <p>Hello <strong>${name}</strong>,</p>
        <p>Your one-time verification code is:</p>
        <div class="code">${code}</div>
        <p>This code expires in <strong>10 minutes</strong>. Do not share it with anyone.</p>
        <div class="footer">
          <p>If you did not request this, please contact your election administrator immediately.</p>
          <p>Departmental Smart Election System</p>
        </div>
      </div>
    </body>
    </html>
  `;

  await transporter.sendMail({
    from: `"${process.env.FROM_NAME}" <${process.env.FROM_EMAIL}>`,
    to,
    subject: `Your Verification Code: ${code}`,
    html
  });

  logger.info(`OTP email sent to ${to}`);
}

// Non-blocking — vote submission never waits for this
function sendVoteConfirmationEmail(to, name, timestamp, receiptCode) {
  const transporter = createTransporter();

  const html = `
    <!DOCTYPE html>
    <html>
    <head><style>
      body { font-family: Arial, sans-serif; background: #0a0a0a; color: #fff; margin: 0; padding: 20px; }
      .container { max-width: 500px; margin: auto; background: #111; border: 1px solid #00ff88; border-radius: 12px; padding: 40px; }
      .success { color: #00ff88; font-size: 24px; font-weight: bold; margin-bottom: 20px; }
      .receipt { background: #1a1a1a; padding: 16px; border-radius: 8px; font-family: monospace; color: #00ff88; }
    </style></head>
    <body>
      <div class="container">
        <div class="success">✅ Vote Confirmed</div>
        <p>Hello <strong>${name}</strong>,</p>
        <p>Your vote has been successfully recorded.</p>
        <div class="receipt">
          <p>Receipt: ${receiptCode}</p>
          <p>Time: ${new Date(timestamp).toLocaleString()}</p>
        </div>
        <p>Your vote is anonymous and secure. Thank you for participating.</p>
      </div>
    </body>
    </html>
  `;

  // Fire and forget — never blocks the vote response
  transporter.sendMail({
    from: `"${process.env.FROM_NAME}" <${process.env.FROM_EMAIL}>`,
    to,
    subject: 'Vote Confirmation Receipt',
    html
  }).then(() => {
    logger.info(`Vote confirmation email sent to ${to}`);
  }).catch((err) => {
    logger.warn(`Vote confirmation email failed (non-critical): ${err.message}`);
  });
}

module.exports = { sendOTPEmail, sendVoteConfirmationEmail };
