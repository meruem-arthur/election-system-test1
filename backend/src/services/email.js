const logger = require('../utils/logger');

// ============================================================
// BREVO HTTP API — works reliably from Render (no SMTP ports)
// ============================================================

async function sendViaBrevo(to, subject, html, name) {
  const response = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'api-key': process.env.BREVO_API_KEY
    },
    body: JSON.stringify({
      sender: {
        name: process.env.FROM_NAME || 'Smart Election System',
        email: process.env.FROM_EMAIL
      },
      to: [{ email: to, name: name || to }],
      subject,
      htmlContent: html
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Brevo API error: ${response.status} — ${error}`);
  }

  return response.json();
}

// ============================================================
// OTP EMAIL
// ============================================================

async function sendOTPEmail(to, name, code) {
  const html = `
    <!DOCTYPE html>
    <html>
    <head><style>
      body { font-family: Arial, sans-serif; background: #0a0a0a; color: #fff; margin: 0; padding: 20px; }
      .container { max-width: 500px; margin: auto; background: #111; border: 1px solid #b44fff; border-radius: 12px; padding: 40px; }
      .logo { color: #b44fff; font-size: 20px; font-weight: bold; margin-bottom: 30px; }
      .code { font-size: 42px; font-weight: bold; color: #f5c842; letter-spacing: 8px; text-align: center; padding: 24px; background: #1a1a1a; border-radius: 8px; margin: 20px 0; border: 1px solid #f5c842; }
      .footer { color: #666; font-size: 12px; margin-top: 30px; }
    </style></head>
    <body>
      <div class="container">
        <div class="logo">⚡ GESA SMART ELECTION SYSTEM</div>
        <p>Hello <strong>${name}</strong>,</p>
        <p>Your one-time verification code is:</p>
        <div class="code">${code}</div>
        <p>This code expires in <strong>10 minutes</strong>. Do not share it with anyone.</p>
        <div class="footer">
          <p>If you did not request this, please contact your election administrator immediately.</p>
          <p>GESA UMaT — Departmental Smart Election System</p>
        </div>
      </div>
    </body>
    </html>
  `;

  await sendViaBrevo(to, `Your Verification Code: ${code}`, html, name);
  logger.info(`OTP email sent via Brevo to ${to}`);
}

// ============================================================
// VOTE CONFIRMATION EMAIL — fire and forget, never blocks vote
// ============================================================

function sendVoteConfirmationEmail(to, name, timestamp, receiptCode) {
  const html = `
    <!DOCTYPE html>
    <html>
    <head><style>
      body { font-family: Arial, sans-serif; background: #0a0a0a; color: #fff; margin: 0; padding: 20px; }
      .container { max-width: 500px; margin: auto; background: #111; border: 1px solid #b44fff; border-radius: 12px; padding: 40px; }
      .success { color: #b44fff; font-size: 24px; font-weight: bold; margin-bottom: 20px; }
      .receipt { background: #1a1a1a; padding: 16px; border-radius: 8px; font-family: monospace; color: #f5c842; }
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
        <p>Your vote is anonymous and secure. Thank you for participating in the GESA election.</p>
      </div>
    </body>
    </html>
  `;

  // Non-blocking — vote submission never waits for this
  sendViaBrevo(to, 'Vote Confirmation Receipt', html, name)
    .then(() => logger.info(`Vote confirmation email sent via Brevo to ${to}`))
    .catch(err => logger.warn(`Vote confirmation email failed (non-critical): ${err.message}`));
}

module.exports = { sendOTPEmail, sendVoteConfirmationEmail };
