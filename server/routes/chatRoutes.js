const express = require('express');
const router = express.Router();
const chatController = require('../controllers/chatController');
const { validateChatMessage, validateConversationId } = require('../middleware/validator');

// POST /api/chat/start - Start a new conversation
router.post('/start', chatController.startChat);

// POST /api/chat/message - Send a message
router.post('/message', validateChatMessage, chatController.sendMessage);

// GET /api/chat/:id - Get a conversation
router.get('/:id', validateConversationId, chatController.getChat);

module.exports = router;

