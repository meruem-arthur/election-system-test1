const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');
const { pool, withTransaction } = require('../config/database');
const { authenticateStudent, authenticateAdmin } = require('../middleware/auth');
const otpService = require('../services/otp');
const auditService = require('../services/audit');
const logger = require('../utils/logger');

// ============================================================
// STUDENT LOGIN
// ============================================================

router.post('/student/login', async (req, res) => {
  const { referenceNumber, password } = req.body;

  if (!referenceNumber || !password) {
    return res.status(400).json({ error: 'Reference number and password are required' });
  }

  try {
    const { rows } = await pool.query(
      `SELECT s.*, e.status as election_status, e.id as election_id
       FROM students s
       JOIN elections e ON s.election_id = e.id
       WHERE s.reference_number = $1`,
      [referenceNumber.trim()]
    );

    const student = rows[0];

    // Generic error to prevent user enumeration
    if (!student) {
      await auditService.log({
        action: 'suspicious_login',
        actorType: 'student',
        metadata: { referenceNumber, reason: 'not_found' },
        ip: req.ip
      });
      return res.status(401).json({ error: 'Invalid reference number or password' });
    }

    if (student.account_locked) {
      return res.status(403).json({ error: 'Account locked. Please contact support.' });
    }

    // Check failed attempts
    if (student.failed_login_attempts >= 5) {
      await pool.query('UPDATE students SET account_locked = true WHERE id = $1', [student.id]);
      return res.status(403).json({ error: 'Account locked after too many attempts. Contact support.' });
    }

    let passwordValid = false;

    if (student.is_first_login) {
      // Temporary password: Surname + last 4 digits of reference number
      const last4 = referenceNumber.slice(-4);
      const tempPassword = `${student.surname}${last4}`;
      passwordValid = password === tempPassword;
    } else {
      passwordValid = await bcrypt.compare(password, student.password_hash);
    }

    if (!passwordValid) {
      await pool.query(
        'UPDATE students SET failed_login_attempts = failed_login_attempts + 1 WHERE id = $1',
        [student.id]
      );
      return res.status(401).json({ error: 'Invalid reference number or password' });
    }

    // Reset failed attempts on success
    await pool.query(
      'UPDATE students SET failed_login_attempts = 0, last_login = NOW() WHERE id = $1',
      [student.id]
    );

    await auditService.log({
      action: 'login',
      actorType: 'student',
      actorId: student.id,
      electionId: student.election_id,
      ip: req.ip,
      userAgent: req.get('user-agent')
    });

    // Generate short-lived token for first login / OTP flow
    const tokenPayload = {
      id: student.id,
      type: 'student',
      electionId: student.election_id,
      isFirstLogin: student.is_first_login,
      isVerified: student.is_verified
    };

    const token = jwt.sign(tokenPayload, process.env.JWT_SECRET, {
      expiresIn: student.is_first_login || !student.is_verified ? '30m' : process.env.JWT_EXPIRES_IN || '8h'
    });

    return res.json({
      token,
      student: {
        id: student.id,
        fullName: student.full_name,
        referenceNumber: student.reference_number,
        indexNumber: student.index_number,
        level: student.level,
        program: student.program,
        hasVoted: student.has_voted,
        isFirstLogin: student.is_first_login,
        isVerified: student.is_verified,
        electionId: student.election_id   // ← ADDED
      },
      requiresPasswordChange: student.is_first_login,
      requiresOtpVerification: !student.is_verified && !student.is_first_login,
      electionStatus: student.election_status
    });

  } catch (err) {
    logger.error('Student login error:', err);
    return res.status(500).json({ error: 'Login failed. Please try again.' });
  }
});

// ============================================================
// CHANGE PASSWORD (first login)
// ============================================================

router.post('/student/change-password', authenticateStudent, async (req, res) => {
  const { newPassword } = req.body;

  if (!newPassword || newPassword.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }

  // Password strength check
  const strongPassword = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
  if (!strongPassword.test(newPassword)) {
    return res.status(400).json({
      error: 'Password must contain uppercase, lowercase, number and special character'
    });
  }

  try {
    const hash = await bcrypt.hash(newPassword, parseInt(process.env.BCRYPT_ROUNDS) || 12);

    await pool.query(
      'UPDATE students SET password_hash = $1, is_first_login = false WHERE id = $2',
      [hash, req.student.id]
    );

    await auditService.log({
      action: 'password_changed',
      actorType: 'student',
      actorId: req.student.id,
      ip: req.ip
    });

    // Now send OTP for verification
    const student = await pool.query('SELECT * FROM students WHERE id = $1', [req.student.id]);
    const otp = await otpService.sendOTP(student.rows[0]);

    return res.json({
      message: 'Password updated. OTP sent for verification.',
      otpChannel: otp.channel,
      otpSentTo: otp.maskedDestination
    });

  } catch (err) {
    logger.error('Change password error:', err);
    return res.status(500).json({ error: 'Failed to update password' });
  }
});

// ============================================================
// VERIFY OTP
// ============================================================

router.post('/student/verify-otp', authenticateStudent, async (req, res) => {
  const { code } = req.body;
  if (!code) return res.status(400).json({ error: 'OTP code is required' });

  try {
    const verified = await otpService.verifyOTP(req.student.id, code);

    if (!verified.success) {
      return res.status(400).json({ error: verified.error });
    }

    await pool.query(
      'UPDATE students SET is_verified = true WHERE id = $1',
      [req.student.id]
    );

    await auditService.log({
      action: 'otp_verified',
      actorType: 'student',
      actorId: req.student.id,
      ip: req.ip
    });

    // Issue full access token
    const token = jwt.sign(
      { id: req.student.id, type: 'student', electionId: req.student.election_id, isVerified: true },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
    );

    return res.json({ message: 'Verification successful', token });

  } catch (err) {
    logger.error('OTP verify error:', err);
    return res.status(500).json({ error: 'Verification failed' });
  }
});

// ============================================================
// RESEND OTP
// ============================================================

router.post('/student/resend-otp', authenticateStudent, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM students WHERE id = $1', [req.student.id]);
    const otp = await otpService.sendOTP(rows[0]);
    return res.json({
      message: 'OTP resent successfully',
      otpChannel: otp.channel,
      otpSentTo: otp.maskedDestination
    });
  } catch (err) {
    logger.error('Resend OTP error:', err);
    return res.status(500).json({ error: 'Failed to resend OTP' });
  }
});

// ============================================================
// ADMIN LOGIN
// ============================================================

router.post('/admin/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

  try {
    const { rows } = await pool.query(
      'SELECT * FROM admins WHERE email = $1 AND is_active = true',
      [email.toLowerCase().trim()]
    );

    const admin = rows[0];
    if (!admin) return res.status(401).json({ error: 'Invalid credentials' });

    const valid = await bcrypt.compare(password, admin.password_hash);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

    await pool.query('UPDATE admins SET last_login = NOW() WHERE id = $1', [admin.id]);

    await auditService.log({
      action: 'login',
      actorType: 'admin',
      actorId: admin.id,
      actorEmail: admin.email,
      ip: req.ip,
      userAgent: req.get('user-agent')
    });

    const token = jwt.sign(
      { id: admin.id, type: 'admin', role: admin.role, email: admin.email },
      process.env.JWT_SECRET,
      { expiresIn: '10h' }
    );

    return res.json({
      token,
      admin: {
        id: admin.id,
        email: admin.email,
        fullName: admin.full_name,
        role: admin.role
      }
    });

  } catch (err) {
    logger.error('Admin login error:', err);
    return res.status(500).json({ error: 'Login failed' });
  }
});

// ============================================================
// ADMIN FORGOT PASSWORD (placeholder — email flow)
// ============================================================

router.post('/admin/forgot-password', async (req, res) => {
  const { email } = req.body;
  // Always return success to prevent enumeration
  res.json({ message: 'If this email is registered, a reset link has been sent.' });

  // Background: send reset email
  try {
    const { rows } = await pool.query('SELECT id FROM admins WHERE email = $1', [email]);
    if (rows[0]) {
      const emailService = require('../services/email');
      const resetToken = crypto.randomBytes(32).toString('hex');
      // Store token hash in DB (not shown for brevity) and email the link
      logger.info(`Password reset requested for admin: ${email}`);
    }
  } catch (err) {
    logger.error('Forgot password error:', err);
  }
});

// ============================================================
// GET CURRENT USER
// ============================================================

router.get('/student/me', authenticateStudent, async (req, res) => {
  const { rows } = await pool.query(
    `SELECT s.id, s.full_name, s.reference_number, s.index_number, s.level, 
            s.program, s.department, s.has_voted, s.is_verified, s.is_first_login,
            e.status as election_status, e.title as election_title,
            e.start_time, e.end_time
     FROM students s JOIN elections e ON s.election_id = e.id
     WHERE s.id = $1`,
    [req.student.id]
  );
  res.json(rows[0]);
});

router.get('/admin/me', authenticateAdmin, async (req, res) => {
  res.json(req.admin);
});

module.exports = router;
