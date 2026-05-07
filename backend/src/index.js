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

// Global rate limiter
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_MAX) || 100,
  message: { error: 'Too many requests, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false
});
app.use(limiter);

// Strict login rate limiter
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Too many login attempts. Please wait 15 minutes.' }
});

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ============================================================
// REQUEST LOGGING
// ============================================================

app.use((req, res, next) => {
  logger.info(`${req.method} ${req.path}`, {
    ip: req.ip,
    userAgent: req.get('user-agent')
  });
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

app.use('/api/auth', loginLimiter, authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/elections', electionRoutes);
app.use('/api/student', studentRoutes);
app.use('/api/candidates', candidateRoutes);
app.use('/api/vote', voteRoutes);
app.use('/api/results', resultRoutes);
app.use('/api/support', supportRoutes);
app.use('/api/audit', auditRoutes);

// Health check
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
  } catch (err) {
    logger.error('❌ Failed to start server:', err);
    process.exit(1);
  }
}

startServer();

module.exports = app;
