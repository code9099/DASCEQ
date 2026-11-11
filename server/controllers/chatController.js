const conversationService = require('../services/conversationService');
const { AppError } = require('../middleware/errorHandler');

/**
 * POST /api/chat/start
 * Start a new chat conversation
 */
async function startChat(req, res, next) {
  try {
    const result = await conversationService.startConversation();

    res.status(201).json({
      success: true,
      data: {
        conversationId: result.conversationId,
        message: result.message,
        stage: result.stage,
        aiProvider: result.aiProvider,
        aiStatus: result.aiStatus,
        aiModel: result.aiModel,
      },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/chat/message
 * Send a message in an existing conversation
 */
async function sendMessage(req, res, next) {
  try {
    const { conversationId, message } = req.body;

    const result = await conversationService.processMessage(conversationId, message);

    res.json({
      success: true,
      data: {
        message: result.message,
        stage: result.stage,
        customerInfo: result.customerInfo,
        appointmentDetails: result.appointmentDetails,
        availableSlots: result.availableSlots,
        quickReplies: result.quickReplies,
        bookingRef: result.bookingRef,
        appointment: result.appointment,
        aiProvider: result.aiProvider,
        aiStatus: result.aiStatus,
        aiModel: result.aiModel,
      },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/chat/:id
 * Get a conversation by ID
 */
async function getChat(req, res, next) {
  try {
    const conversation = await conversationService.getConversation(req.params.id);

    if (!conversation) {
      throw new AppError('Conversation not found.', 404);
    }

    res.json({
      success: true,
      data: conversation,
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  startChat,
  sendMessage,
  getChat,
};
