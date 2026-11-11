const appointmentService = require('../services/appointmentService');
const conversationService = require('../services/conversationService');
const { AppError } = require('../middleware/errorHandler');

/**
 * GET /api/appointments/availability?date=YYYY-MM-DD
 * Get available time slots for a date
 */
async function getAvailability(req, res, next) {
  try {
    const { date } = req.query;
    const result = await appointmentService.getAvailability(date);

    if (!result.success) {
      throw new AppError(result.error, 400);
    }

    res.json({
      success: true,
      data: result.data,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/appointments
 * Create a new appointment
 */
async function createAppointment(req, res, next) {
  try {
    const { conversationId, date, time } = req.body;

    const conversation = await conversationService.getConversation(conversationId);
    if (!conversation) {
      throw new AppError('Conversation not found.', 404);
    }

    const { customerInfo } = conversation;
    if (!customerInfo.name || !customerInfo.phone || !customerInfo.email || !customerInfo.enquiryPurpose) {
      throw new AppError(
        'Customer details are incomplete. Please provide name, phone, email, and enquiry purpose.',
        400
      );
    }

    const result = await appointmentService.createAppointment({
      conversationId,
      customerInfo,
      date,
      time,
    });

    if (!result.success) {
      throw new AppError(result.error, 400);
    }

    res.status(201).json({
      success: true,
      data: result.data,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/appointments/:id
 * Get an appointment by ID or booking reference
 */
async function getAppointment(req, res, next) {
  try {
    const result = await appointmentService.getAppointment(req.params.id);

    if (!result.success) {
      throw new AppError(result.error, 404);
    }

    res.json({
      success: true,
      data: result.data,
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getAvailability,
  createAppointment,
  getAppointment,
};
