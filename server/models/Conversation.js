/**
 * Conversation persistence repository and state-machine stage constants.
 * Routes transparently between Mongoose (`ConversationDoc`) and `store.json` depending on DB readiness.
 */
const mongoose = require('mongoose');
const { generateId } = require('../utils/helpers');
const { isMongoReady, readLocalStoreSync, mutateLocalStore } = require('../services/dbService');

/** Ordered lifecycle stages enforced by `conversationService` before allowing a booking. */
const STAGES = {
  GREETING: 'GREETING',
  UNDERSTAND_INTENT: 'UNDERSTAND_INTENT',
  COLLECT_CUSTOMER_DETAILS: 'COLLECT_CUSTOMER_DETAILS',
  VALIDATE_DETAILS: 'VALIDATE_DETAILS',
  COLLECT_APPOINTMENT_PREFERENCES: 'COLLECT_APPOINTMENT_PREFERENCES',
  CHECK_AVAILABILITY: 'CHECK_AVAILABILITY',
  AWAIT_CUSTOMER_CONFIRMATION: 'AWAIT_CUSTOMER_CONFIRMATION',
  CREATE_BOOKING: 'CREATE_BOOKING',
  BOOKING_CONFIRMED: 'BOOKING_CONFIRMED',
};

const MessageSchema = new mongoose.Schema(
  {
    role: { type: String, enum: ['user', 'assistant'], required: true },
    content: { type: String, required: true },
    timestamp: { type: String, required: true },
  },
  { _id: false }
);

const ConversationSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, unique: true, index: true },
    customerInfo: {
      name: { type: String, default: null },
      phone: { type: String, default: null },
      email: { type: String, default: null },
      enquiryPurpose: { type: String, default: null },
      followUpNotes: { type: String, default: null },
    },
    messages: { type: [MessageSchema], default: [] },
    stage: { type: String, default: STAGES.GREETING },
    followUpAsked: { type: Boolean, default: false },
    lastPromptField: { type: String, default: null },
    appointmentDetails: {
      date: { type: String, default: null },
      time: { type: String, default: null },
      slotId: { type: String, default: null },
    },
    bookingRef: { type: String, default: null },
    createdAt: { type: String, required: true },
    updatedAt: { type: String, required: true, index: true },
  },
  { versionKey: false }
);

const ConversationDoc =
  mongoose.models.Conversation || mongoose.model('Conversation', ConversationSchema);

function normalizeDoc(doc) {
  if (!doc) return null;
  const plain = typeof doc.toObject === 'function' ? doc.toObject() : { ...doc };
  delete plain._id;
  return plain;
}

async function createConversation() {
  const now = new Date().toISOString();
  const conversation = {
    id: generateId(),
    customerInfo: {
      name: null,
      phone: null,
      email: null,
      enquiryPurpose: null,
      followUpNotes: null,
    },
    messages: [],
    stage: STAGES.GREETING,
    followUpAsked: false,
    lastPromptField: null,
    appointmentDetails: {
      date: null,
      time: null,
      slotId: null,
    },
    bookingRef: null,
    createdAt: now,
    updatedAt: now,
  };

  if (isMongoReady()) {
    const created = await ConversationDoc.create(conversation);
    return normalizeDoc(created);
  }

  return mutateLocalStore((store) => {
    store.conversations[conversation.id] = conversation;
    return structuredClone(conversation);
  });
}

async function getConversation(id) {
  if (!id) return null;
  if (isMongoReady()) {
    const doc = await ConversationDoc.findOne({ id }).lean();
    return normalizeDoc(doc);
  }
  const store = readLocalStoreSync();
  const found = store.conversations[id];
  return found ? structuredClone(found) : null;
}

async function updateConversation(id, updates) {
  if (!id) return null;
  const updatedAt = new Date().toISOString();

  if (isMongoReady()) {
    const doc = await ConversationDoc.findOneAndUpdate(
      { id },
      { $set: { ...updates, updatedAt } },
      { returnDocument: 'after' }
    ).lean();
    return normalizeDoc(doc);
  }

  return mutateLocalStore((store) => {
    const conv = store.conversations[id];
    if (!conv) return null;
    Object.assign(conv, updates, { updatedAt });
    store.conversations[id] = conv;
    return structuredClone(conv);
  });
}

async function addMessage(id, role, content) {
  if (!id) return null;
  const msg = {
    role,
    content,
    timestamp: new Date().toISOString(),
  };
  const updatedAt = msg.timestamp;

  if (isMongoReady()) {
    const doc = await ConversationDoc.findOneAndUpdate(
      { id },
      { $push: { messages: msg }, $set: { updatedAt } },
      { returnDocument: 'after' }
    ).lean();
    return normalizeDoc(doc);
  }

  return mutateLocalStore((store) => {
    const conv = store.conversations[id];
    if (!conv) return null;
    conv.messages.push(msg);
    conv.updatedAt = updatedAt;
    store.conversations[id] = conv;
    return structuredClone(conv);
  });
}

async function deleteConversation(id) {
  if (!id) return false;
  if (isMongoReady()) {
    const res = await ConversationDoc.deleteOne({ id });
    return res.deletedCount > 0;
  }

  return mutateLocalStore((store) => {
    if (!store.conversations[id]) return false;
    delete store.conversations[id];
    return true;
  });
}

module.exports = {
  STAGES,
  createConversation,
  getConversation,
  updateConversation,
  addMessage,
  deleteConversation,
};
