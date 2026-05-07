const jwt = require('jsonwebtoken');
const { pool } = require('../config/database');

// Verify student JWT
async function authenticateStudent(req, res, next) {
  try {
    const token = extractToken(req);
    if (!token) return res.status(401).json({ error: 'Authentication required' });

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded.type !== 'student') return res.status(403).json({ error: 'Invalid token type' });

    const { rows } = await pool.query(
      'SELECT id, full_name, reference_number, election_id, is_verified, has_voted, account_locked FROM students WHERE id = $1',
      [decoded.id]
    );

    if (!rows[0]) return res.status(401).json({ error: 'Student not found' });
    if (rows[0].account_locked) return res.status(403).json({ error: 'Account is locked. Contact support.' });

    req.student = rows[0];
    req.tokenData = decoded;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') return res.status(401).json({ error: 'Session expired. Please login again.' });
    return res.status(401).json({ error: 'Invalid authentication token' });
  }
}

// Verify admin JWT
async function authenticateAdmin(req, res, next) {
  try {
    const token = extractToken(req);
    if (!token) return res.status(401).json({ error: 'Authentication required' });

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded.type !== 'admin') return res.status(403).json({ error: 'Admin access required' });

    const { rows } = await pool.query(
      'SELECT id, email, full_name, role, is_active FROM admins WHERE id = $1',
      [decoded.id]
    );

    if (!rows[0]) return res.status(401).json({ error: 'Admin not found' });
    if (!rows[0].is_active) return res.status(403).json({ error: 'Admin account is deactivated' });

    req.admin = rows[0];
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') return res.status(401).json({ error: 'Session expired' });
    return res.status(401).json({ error: 'Invalid authentication token' });
  }
}

// Role-based access for admins
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.admin) return res.status(401).json({ error: 'Not authenticated' });
    if (!roles.includes(req.admin.role)) {
      return res.status(403).json({ error: 'Insufficient permissions for this action' });
    }
    next();
  };
}

// Require OTP verified student
function requireVerified(req, res, next) {
  if (!req.student.is_verified) {
    return res.status(403).json({
      error: 'Account not verified. Please complete OTP verification.',
      requiresVerification: true
    });
  }
  next();
}

function extractToken(req) {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }
  return null;
}

module.exports = {
  authenticateStudent,
  authenticateAdmin,
  requireRole,
  requireVerified
};
