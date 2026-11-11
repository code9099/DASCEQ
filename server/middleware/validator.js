const { AppError } = require('./errorHandler');
const { containsUnsafeKeys } = require('../services/securityService');

const UUID_REGEX = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const SAFE_ID_REGEX = /^[a-zA-Z0-9_-]{8,80}$/;
const BOOKING_REF_REGEX = /^DSQ-[A-Z0-9]{4,10}$/i;

/**
 * Validate chat message request
 */
function validateChatMessage(req, res, next) {
  if (containsUnsafeKeys(req.body)) {
    return next(new AppError('Invalid request payload.', 400));
  }

  const { conversationId, message } = req.body;

  if (!conversationId || typeof conversationId !== 'string' || !SAFE_ID_REGEX.test(conversationId.trim())) {
    return next(new AppError('conversationId is required and must be a valid ID string.', 400));
  }

  if (!message || typeof message !== 'string') {
    return next(new AppError('message is required and must be a string.', 400));
  }

  if (message.trim().length === 0) {
    return next(new AppError('message cannot be empty.', 400));
  }

  if (message.length > 2000) {
    return next(new AppError('message must be 2000 characters or less.', 400));
  }

  next();
}

/**
 * Validate conversation ID in params
 */
function validateConversationId(req, res, next) {
  const { id } = req.params;

  if (!id || typeof id !== 'string' || (!UUID_REGEX.test(id) && !SAFE_ID_REGEX.test(id))) {
    return next(new AppError('Valid Conversation ID is required.', 400));
  }

  next();
}

/**
 * Validate date query parameter
 */
function validateDateQuery(req, res, next) {
  if (containsUnsafeKeys(req.query)) {
    return next(new AppError('Invalid query parameters.', 400));
  }

  const { date } = req.query;

  if (!date || typeof date !== 'string') {
    return next(new AppError('date query parameter is required (YYYY-MM-DD).', 400));
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return next(new AppError('date must be in YYYY-MM-DD format.', 400));
  }

  next();
}

/**
 * Validate appointment creation request
 */
function validateAppointmentCreate(req, res, next) {
  if (containsUnsafeKeys(req.body)) {
    return next(new AppError('Invalid request payload.', 400));
  }

  const { conversationId, date, time } = req.body;

  if (!conversationId || typeof conversationId !== 'string' || !SAFE_ID_REGEX.test(conversationId.trim())) {
    return next(new AppError('Valid conversationId is required.', 400));
  }

  if (!date || typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return next(new AppError('date is required in YYYY-MM-DD format.', 400));
  }

  if (!time || typeof time !== 'string' || !/^\d{2}:\d{2}$/.test(time)) {
    return next(new AppError('time is required in HH:MM format.', 400));
  }

  next();
}

/**
 * Validate appointment ID or booking reference in params
 */
function validateAppointmentIdentifier(req, res, next) {
  const { id } = req.params;
  if (!id || typeof id !== 'string' || (!BOOKING_REF_REGEX.test(id.trim()) && !SAFE_ID_REGEX.test(id.trim()))) {
    return next(new AppError('Valid appointment ID or booking reference (DSQ-XXXXXX) is required.', 400));
  }
  next();
}

module.exports = {
  validateChatMessage,
  validateConversationId,
  validateDateQuery,
  validateAppointmentCreate,
  validateAppointmentIdentifier,
};

