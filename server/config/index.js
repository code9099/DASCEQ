/**
 * Centralized server configuration loaded from `server/.env` with startup validation.
 * Secrets such as `GEMINI_API_KEY` and `MONGODB_URI` stay strictly on the server
 * and are never exposed or echoed to the client.
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const nodeEnv = (process.env.NODE_ENV || 'development').trim();
const isProduction = nodeEnv === 'production';

const defaultDevOrigins = ['http://localhost:5173', 'http://127.0.0.1:5173'];
const envOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',')
      .map((o) => o.trim().replace(/\/+$/, ''))
      .filter(Boolean)
  : [];

// In production, never silently fall back to localhost dev origins or allow bare wildcard '*'
const rawCorsOrigins = isProduction
  ? envOrigins.filter((o) => o !== '*')
  : Array.from(new Set([...defaultDevOrigins, ...envOrigins]));

const parsedPort = parseInt(process.env.PORT || '5000', 10);

const config = {
  port: Number.isInteger(parsedPort) && parsedPort > 0 && parsedPort <= 65535 ? parsedPort : 5000,
  geminiApiKey: (process.env.GEMINI_API_KEY || '').trim(),
  geminiModel: (process.env.GEMINI_MODEL || 'gemini-3-flash-preview').trim(),
  mongodbUri: (
    process.env.MONGODB_URI ||
    (isProduction ? '' : 'mongodb://127.0.0.1:27017/dasceq_chatbot')
  ).trim(),
  nodeEnv,
  isProduction,
  trustProxy:
    process.env.TRUST_PROXY === 'true'
      ? 1
      : process.env.TRUST_PROXY === 'false'
      ? false
      : isProduction
      ? 1
      : false,
  corsOrigins: rawCorsOrigins,
  corsWildcardRejected: isProduction && envOrigins.includes('*'),
  rateLimit: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: parseInt(process.env.RATE_LIMIT_MAX || '200', 10) || 200,
  },
  aiTimeoutMs: parseInt(process.env.AI_TIMEOUT_MS, 10) || 15000,
};

/**
 * Validate critical environment settings at server startup without logging secret values.
 * @returns {{ warnings: string[] }}
 */
function validateConfig() {
  const warnings = [];

  if (process.env.PORT && (!Number.isInteger(parsedPort) || parsedPort <= 0 || parsedPort > 65535)) {
    throw new Error(`Invalid PORT "${process.env.PORT}". Must be an integer between 1 and 65535.`);
  }

  if (config.corsWildcardRejected) {
    warnings.push('Wildcard CORS_ORIGIN="*" is ignored in production; specify exact frontend origins.');
  }

  if (isProduction && config.corsOrigins.length === 0) {
    warnings.push('No CORS_ORIGIN configured for production; cross-origin browser requests will be blocked.');
  }

  if (isProduction && !config.mongodbUri) {
    warnings.push('MONGODB_URI is not set in production; using ephemeral local JSON store unless persistent storage is attached.');
  }

  if (!config.geminiApiKey || config.geminiApiKey === 'your_gemini_api_key_here') {
    warnings.push('GEMINI_API_KEY not configured; assistant will run using deterministic DemoProvider.');
  }

  return { warnings };
}

module.exports = {
  ...config,
  validateConfig,
};
