const { redactForLog } = require('../services/securityService');

/**
 * Custom application error class
 */
class AppError extends Error {
  constructor(message, statusCode = 500) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Centralized error handling middleware.
 * Strips stack traces in production and redacts any PII/secrets in logs.
 */
function errorHandler(err, req, res, _next) {
  // Handle malformed JSON request bodies cleanly as 400 instead of 500
  if (err?.type === 'entity.parse.failed' || (err instanceof SyntaxError && err.status === 400)) {
    return res.status(400).json({
      success: false,
      error: 'Invalid JSON payload.',
    });
  }

  const statusCode = err.statusCode || err.status || 500;
  const isOperational = Boolean(err.isOperational);
  const safeMsg = redactForLog(String(err.message || 'Unknown error'));

  if (!isOperational && statusCode >= 500) {
    console.error('💥 Unexpected Error:', safeMsg);
  } else {
    console.warn(`⚠️ Request Error [${statusCode}]:`, safeMsg);
  }

  res.status(statusCode).json({
    success: false,
    error: isOperational ? err.message : 'An unexpected error occurred. Please try again later.',
    ...(process.env.NODE_ENV === 'development' && !isOperational ? { stack: err.stack } : {}),
  });
}

/**
 * 404 handler for unknown routes
 */
function notFoundHandler(req, res, _next) {
  res.status(404).json({
    success: false,
    error: `Route not found: ${req.method} ${req.originalUrl}`,
  });
}

module.exports = {
  AppError,
  errorHandler,
  notFoundHandler,
};

