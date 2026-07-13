const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { pool } = require('./config/database');
const logger = require('./utils/logger');
require('dotenv').config();

const app = express();
app.set('trust proxy', 1);

// ============================================================
// SECURITY MIDDLEWARE
// ============================================================

app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' }
}));

app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Global rate limiter — generous, just prevents extreme abuse
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_MAX) || 200,
  message: { error: 'Too many requests, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
  // Skip health check pings from UptimeRobot
  skip: (req) => req.path === '/api/health'
});
app.use(limiter);

// Login rate limiter — much more generous, keyed by IP + reference number
// so different students from same IP don't block each other
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50, // 50 login attempts per IP per 15 mins — enough for a whole class
  message: { error: 'Too many login attempts from this network. Please wait 15 minutes.' },
  // Key by IP only for admin login, but student login is handled in auth.js per-account
  keyGenerator: (req) => {
    // Use IP + reference number so each student account has its own counter
    const refNumber = req.body?.referenceNumber || req.body?.email || 'unknown';
    return `${req.ip}_${refNumber}`;
  },
  skip: (req) => {
    // Don't rate limit OTP verification or resend — those have their own limits
    return req.path === '/student/verify-otp' ||
           req.path === '/student/resend-otp' ||
           req.path === '/student/verification-status';
  }
});

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ============================================================
// REQUEST LOGGING
// ============================================================

app.use((req, res, next) => {
  // Skip logging health checks to reduce noise
  if (req.path !== '/api/health') {
    logger.info(`${req.method} ${req.path}`, {
      ip: req.ip,
      userAgent: req.get('user-agent')
    });
  }
  next();
});

// ============================================================
// ROUTES
// ============================================================

const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/admin');
const electionRoutes = require('./routes/election');
const studentRoutes = require('./routes/student');
const candidateRoutes = require('./routes/candidate');
const voteRoutes = require('./routes/vote');
const resultRoutes = require('./routes/result');
const supportRoutes = require('./routes/support');
const auditRoutes = require('./routes/audit');
const webhookRoutes = require('./routes/webhooks');
const credentialDispatch = require('./services/credentialDispatch');

app.use('/api/auth', loginLimiter, authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/elections', electionRoutes);
app.use('/api/student', studentRoutes);
app.use('/api/candidates', candidateRoutes);
app.use('/api/vote', voteRoutes);
app.use('/api/results', resultRoutes);
app.use('/api/support', supportRoutes);
app.use('/api/audit', auditRoutes);
app.use('/api/webhooks', webhookRoutes);

// Health check — always responds, never rate limited
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ============================================================
// ERROR HANDLER
// ============================================================

app.use((err, req, res, next) => {
  logger.error('Unhandled error:', err);
  res.status(err.status || 500).json({
    error: process.env.NODE_ENV === 'production'
      ? 'Internal server error'
      : err.message
  });
});

// ============================================================
// START SERVER
// ============================================================

const PORT = process.env.PORT || 5000;

async function startServer() {
  try {
    await pool.query('SELECT 1');
    logger.info('✅ Database connected');
    app.listen(PORT, () => {
      logger.info(`🚀 Election System API running on port ${PORT}`);
      logger.info(`   Environment: ${process.env.NODE_ENV}`);
    });
    // Keeps processing queued credential dispatch rows beyond whatever the
    // first batch (BATCH_SIZE=15) catches on enqueue — without this, any
    // cohort larger than 15 silently stalls after the first tick.
    credentialDispatch.startWorker();
  } catch (err) {
    logger.error('❌ Failed to start server:', err);
    process.exit(1);
  }
}

startServer();
module.exports = app;
