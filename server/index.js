/**
 * Express server entry point for Dasceq Customer Enquiry & Appointment Assistant.
 * Configures reverse-proxy trust, Helmet security headers, strict CORS allowlist,
 * `/api/` rate limiting (excluding `/api/health`), health readiness endpoint,
 * route mounting, database initialization, and graceful SIGINT/SIGTERM shutdown.
 */
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const config = require('./config');
const { companyProfile } = require('./config/companyProfile');
const { initDatabase, closeDatabase, getPersistenceStatus } = require('./services/dbService');
const {
  getActiveAiProviderName,
  getAiRuntimeStatus,
  verifyAiProviderStartup,
} = require('./services/conversationService');
const { redactForLog } = require('./services/securityService');
const chatRoutes = require('./routes/chatRoutes');
const appointmentRoutes = require('./routes/appointmentRoutes');
const { AppError, errorHandler, notFoundHandler } = require('./middleware/errorHandler');

const app = express();

// ── Reverse Proxy / HTTPS Readiness ──
app.disable('x-powered-by');
if (config.trustProxy) {
  app.set('trust proxy', config.trustProxy);
}

// ── Security Headers ──
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    hsts: config.isProduction ? { maxAge: 31536000, includeSubDomains: true } : false,
  })
);

// ── Strict CORS Allowlist ──
const allowedOriginsSet = new Set(config.corsOrigins);
app.use(
  cors({
    origin(origin, callback) {
      // Allow same-origin/non-browser tools (curl, health checks, Node regression tests) with no Origin header
      if (!origin) {
        return callback(null, true);
      }
      const normalized = origin.replace(/\/+$/, '');
      if (allowedOriginsSet.has(normalized)) {
        return callback(null, true);
      }
      return callback(new AppError('Origin not allowed by CORS policy.', 403));
    },
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
    maxAge: 600,
  })
);

// ── Body Parsing ──
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));

// ── Rate Limiting (skip /api/health probes) ──
const limiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.max,
  skip: (req) => req.path === '/health',
  message: {
    success: false,
    error: 'Too many requests. Please try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/', limiter);

// ── Health / Readiness Check (zero secrets exposed) ──
app.get('/api/health', (req, res) => {
  const persistence = getPersistenceStatus();
  const aiStatusInfo = getAiRuntimeStatus();
  res.json({
    success: true,
    data: {
      status: 'healthy',
      service: `${companyProfile.name} AI Assistant`,
      timestamp: new Date().toISOString(),
      environment: config.nodeEnv,
      aiProvider: getActiveAiProviderName(),
      aiStatus: aiStatusInfo.status,
      aiModel: aiStatusInfo.model,
      persistence: persistence.mode,
      mongoConnected: persistence.mongoConnected,
    },
  });
});

// ── Routes ──
app.use('/api/chat', chatRoutes);
app.use('/api/appointments', appointmentRoutes);

// ── 404 & Centralized Error Handlers ──
app.use(notFoundHandler);
app.use(errorHandler);

/**
 * Initialize config/database, launch HTTP server, and bind graceful shutdown hooks.
 */
async function startServer() {
  const { warnings } = config.validateConfig();
  for (const warning of warnings) {
    console.warn(`⚠️ Config warning: ${warning}`);
  }

  await initDatabase();

  const server = app.listen(config.port, () => {
    const persistence = getPersistenceStatus();
    const aiInfo = getAiRuntimeStatus();
    console.log(`\n🚀 ${companyProfile.name} Server running on port ${config.port}`);
    console.log(`📍 Environment: ${config.nodeEnv}`);
    console.log(`🤖 AI Mode: ${aiInfo.activeProvider} (${aiInfo.status})`);
    console.log(`💾 Persistence: ${persistence.mode} (${redactForLog(persistence.detail)})`);
    console.log(`💊 Health endpoint ready at /api/health\n`);
  });

  // Non-blocking credential/connectivity probe so startup speed stays instant while
  // /api/health reflects real Gemini availability rather than claiming live AI when blocked/invalid.
  verifyAiProviderStartup().catch(() => {});

  server.on('error', (err) => {
    console.error('❌ Server failed to start:', redactForLog(err.message));
    process.exit(1);
  });

  let shuttingDown = false;
  const gracefulShutdown = async (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`\n🛑 Received ${signal}. Closing HTTP server and database connections...`);
    const forceExitTimer = setTimeout(() => {
      console.warn('⚠️ Forced shutdown after 5s timeout.');
      process.exit(1);
    }, 5000);
    forceExitTimer.unref();

    server.close(async () => {
      await closeDatabase();
      clearTimeout(forceExitTimer);
      console.log('✅ Graceful shutdown complete.');
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));

  return server;
}

if (require.main === module) {
  startServer().catch((err) => {
    console.error('❌ Startup error:', redactForLog(err.message));
    process.exit(1);
  });
}

module.exports = { app, startServer };
