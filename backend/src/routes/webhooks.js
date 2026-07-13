const express = require('express');
const router = express.Router();
const twilio = require('twilio');
const { pool } = require('../config/database');
const logger = require('../utils/logger');

// ============================================================
// TWILIO SMS DELIVERY STATUS WEBHOOK (Phase 2)
//
// Twilio POSTs here whenever a message's status changes (queued ->
// sent -> delivered, or -> undelivered/failed) IF TWILIO_STATUS_CALLBACK_URL
// is set to this endpoint's public URL. This is the only way to know
// whether a credential SMS actually reached the handset — sms_status =
// 'sent' in credential_dispatch only means Twilio accepted it.
//
// This route is intentionally NOT behind authenticateAdmin (Twilio has
// no way to send a bearer token). Instead it's verified using Twilio's
// request signature, which only Twilio (holder of your auth token) can
// produce — so it can't be spoofed by a third party hitting this URL.
// ============================================================

router.post('/twilio/sms-status', express.urlencoded({ extended: false }), async (req, res) => {
  // Always ack quickly regardless of outcome below — Twilio retries
  // aggressively on non-2xx, and we don't want it hammering this endpoint
  // over something like an unrecognized SID.
  res.status(200).send('OK');

  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!authToken) {
    logger.warn('Twilio status webhook hit but TWILIO_AUTH_TOKEN is not configured — ignoring.');
    return;
  }

  const signature = req.get('X-Twilio-Signature');
  // Build the exact URL Twilio signed against. Requires app.set('trust proxy', 1)
  // (already set in index.js) so req.protocol reflects the real scheme behind Render's proxy.
  const fullUrl = `${req.protocol}://${req.get('host')}${req.originalUrl}`;

  const validator = new twilio.RequestValidator(authToken);
  const isValid = signature && validator.validate(fullUrl, req.body, signature);

  if (!isValid) {
    logger.warn(`Rejected Twilio status webhook with invalid signature from ${req.ip}`);
    return;
  }

  const { MessageSid, MessageStatus, ErrorCode, ErrorMessage } = req.body;
  if (!MessageSid || !MessageStatus) {
    logger.warn('Twilio status webhook missing MessageSid/MessageStatus fields');
    return;
  }

  try {
    const { rowCount } = await pool.query(
      `UPDATE credential_dispatch
       SET sms_delivery_status = $1,
           sms_delivery_error = $2,
           sms_delivered_at = CASE WHEN $1 = 'delivered' THEN NOW() ELSE sms_delivered_at END
       WHERE sms_message_sid = $3`,
      [MessageStatus, ErrorMessage || (ErrorCode ? `Twilio error ${ErrorCode}` : null), MessageSid]
    );

    if (rowCount === 0) {
      // Not necessarily a problem — could be an OTP SMS (no SID stored for
      // those) or a message sent before this column existed.
      logger.info(`Twilio status webhook: no credential_dispatch row for SID ${MessageSid} (status: ${MessageStatus})`);
    } else {
      logger.info(`SMS ${MessageSid} -> ${MessageStatus}${ErrorCode ? ` (error ${ErrorCode})` : ''}`);
    }
  } catch (err) {
    logger.error('Failed to record Twilio delivery status:', err);
  }
});

module.exports = router;
