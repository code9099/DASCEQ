/**
 * Authoritative multi-turn conversation & booking orchestration state machine.
 *
 * Flow:
 *   GREETING -> UNDERSTAND_INTENT -> COLLECT_CUSTOMER_DETAILS (with contextual follow-up)
 *   -> COLLECT_APPOINTMENT_PREFERENCES -> CHECK_AVAILABILITY -> AWAIT_CUSTOMER_CONFIRMATION -> BOOKING_CONFIRMED
 *
 * Security & correctness invariants:
 * - Deterministic extraction runs every turn alongside AI extraction so invalid phone/email/date
 *   inputs receive explicit validation feedback rather than being silently ignored.
 * - Bookings are NEVER created by an AI response alone; `appointmentService.createAppointment`
 *   only executes after explicit confirmation in `AWAIT_CUSTOMER_CONFIRMATION`.
 */
const ConversationModel = require('../models/Conversation');
const { STAGES } = require('../models/Conversation');
const {
  createAIProvider,
  extractDeterministicInfo,
  buildContextualFollowUp,
  buildSpecialQueryResponse,
} = require('./aiService');
const { companyProfile } = require('../config/companyProfile');
const {
  detectSecurityThreat,
  sanitizeAssistantOutput,
} = require('./securityService');
const customerService = require('./customerService');
const appointmentService = require('./appointmentService');
const availabilityService = require('./availabilityService');
const { formatDate, formatTime } = require('../utils/helpers');
const { AppError } = require('../middleware/errorHandler');

const aiProvider = createAIProvider();

const TECHNICAL_OR_ENQUIRY_WORDS =
  /\b(ai|ml|product|pricing|demo|support|issue|bug|error|cloud|data|software|website|app|chatbot|automation|consulting|integration|migration|service|help|enquiry|inquiry|project|solution|platform|crm|erp|api|timeline|budget|team|company|business|need|want|looking|interested|build|develop|create|automate|improve|upgrade|fix|discuss|book|schedule|appointment|analytics)\b/i;

const FIELD_PATTERNS = {
  name: /\b(full\s+name|your\s+name|name)\b/i,
  phone: /\b(phone|mobile|contact\s+number|number)\b/i,
  email: /\b(email|e-mail)\b/i,
  enquiryPurpose: /\b(purpose|enquiry|inquiry|looking\s+for|help\s+you\s+with)\b/i,
};

const GENERIC_PURPOSES = new Set([
  'appointment scheduling',
  'schedule an appointment',
  'book an appointment',
  'appointment',
  'product enquiry',
  'general support',
  'general enquiry',
  'support',
  'enquiry',
  'inquiry',
]);

function getAiRuntimeStatus() {
  return aiProvider.getRuntimeStatus
    ? aiProvider.getRuntimeStatus()
    : {
        configured: aiProvider.name !== 'demo',
        activeProvider: aiProvider.name || 'demo',
        status: aiProvider.name === 'demo' ? 'demo' : 'standby',
        model: null,
        reason: null,
      };
}

function getActiveAiProviderName() {
  return getAiRuntimeStatus().activeProvider || 'demo';
}

async function verifyAiProviderStartup() {
  if (typeof aiProvider.verifyStartup === 'function') {
    return aiProvider.verifyStartup();
  }
  return getAiRuntimeStatus();
}

function formatSlotSummaryList(slots) {
  const display = slots.slice(0, 10).map((s) => `• ${s.displayTime}`).join('\n');
  const extra = slots.length > 10 ? `\n...and ${slots.length - 10} more slots available.` : '';
  return `${display}${extra}`;
}

function buildPreConfirmationSummary(customerInfo, date, time) {
  const lines = [
    'Please review your complete appointment details before I confirm:',
    '',
    `• **Name:** ${customerInfo.name}`,
    `• **Phone:** ${customerInfo.phone}`,
    `• **Email:** ${customerInfo.email}`,
    `• **Purpose:** ${customerInfo.enquiryPurpose}`,
    `• **Date:** ${formatDate(date)}`,
    `• **Time:** ${formatTime(time)} IST`,
    '',
    'Shall I confirm and book this appointment? Reply **Yes** to confirm, or **No** if you would like to change the date, time, or your details.',
  ];
  return lines.join('\n');
}

function buildFinalBookingConfirmation(appointment) {
  const { customerInfo } = appointment;
  const lines = [
    '✅ Your appointment is confirmed!',
    '',
    `• **Booking Reference:** ${appointment.bookingRef}`,
    `• **Status:** Confirmed`,
    `• **Name:** ${customerInfo.name}`,
    `• **Phone:** ${customerInfo.phone}`,
    `• **Email:** ${customerInfo.email}`,
    `• **Purpose:** ${customerInfo.enquiryPurpose}`,
    `• **Date:** ${appointment.displayDate}`,
    `• **Time:** ${appointment.displayTime} IST`,
    '',
    'Please save your booking reference for future updates or lookup. Is there anything else I can assist you with?',
  ];
  return lines.join('\n');
}

function getMissingCustomerFields(info) {
  const required = ['enquiryPurpose', 'name', 'phone', 'email'];
  return required.filter((field) => !info?.[field]);
}

function promptForMissingField(field) {
  switch (field) {
    case 'name':
      return {
        prompt: 'Could you please share your full name?',
        field: 'name',
      };
    case 'phone':
      return {
        prompt: 'Could you please share your 10-digit Indian mobile number? (e.g., 9876543210)',
        field: 'phone',
      };
    case 'email':
      return {
        prompt: 'What is your email address?',
        field: 'email',
      };
    case 'enquiryPurpose':
    default:
      return {
        prompt: 'Could you tell me the purpose of your enquiry?',
        field: 'enquiryPurpose',
      };
  }
}

function extractInlineEditValue(message, targetField) {
  if (!message || !targetField) return null;
  const trimmed = message.trim();

  if (targetField === 'name') {
    const m = trimmed.match(
      /(?:name\s*(?:is|to|:)|change\s+(?:it|my\s+name)\s+to|update\s+(?:it|my\s+name)\s+to)\s+([a-zA-Z][a-zA-Z\s'.-]{1,60})$/i
    );
    return m ? m[1].trim() : null;
  }
  if (targetField === 'enquiryPurpose') {
    const m = trimmed.match(
      /(?:purpose\s*(?:is|to|:)|enquiry\s*(?:is|to|:)|change\s+(?:purpose|enquiry)\s+to)\s+(.+)$/i
    );
    return m ? m[1].trim() : null;
  }
  return null;
}

/**
 * Start a new conversation
 */
async function startConversation() {
  const conversation = await ConversationModel.createConversation();

  const welcomeMessage =
    `Hello! 👋 Welcome to ${companyProfile.name}. I'm your virtual receptionist and I'm here to help with our services, answer enquiries, or schedule an appointment.\n\nHow can I assist you today?`;

  await ConversationModel.addMessage(conversation.id, 'assistant', welcomeMessage);
  await ConversationModel.updateConversation(conversation.id, {
    stage: STAGES.UNDERSTAND_INTENT,
    lastPromptField: 'purpose',
  });

  const startAiStatus = getAiRuntimeStatus();

  return {
    conversationId: conversation.id,
    message: welcomeMessage,
    stage: STAGES.UNDERSTAND_INTENT,
    aiProvider: startAiStatus.activeProvider,
    aiStatus: startAiStatus.status,
    aiModel: startAiStatus.model,
  };
}

/**
 * Process a user message in a conversation
 */
async function processMessage(conversationId, rawUserMessage) {
  const conversation = await ConversationModel.getConversation(conversationId);
  if (!conversation) {
    throw new AppError('Conversation not found.', 404);
  }

  const rawTrimmed = typeof rawUserMessage === 'string' ? rawUserMessage.trim() : '';
  const userMessage = customerService.sanitizeInput(rawUserMessage);
  const rawThreat = detectSecurityThreat(rawTrimmed);
  const sanitizedThreat = detectSecurityThreat(userMessage);
  const securityThreat = rawThreat.blocked ? rawThreat : sanitizedThreat;

  if (!userMessage && !securityThreat.blocked) {
    throw new AppError('Message cannot be empty.', 400);
  }

  const storedUserMessage = userMessage || '[Restricted instruction-like input]';
  await ConversationModel.addMessage(conversationId, 'user', storedUserMessage);
  const updatedWithUserMsg = await ConversationModel.getConversation(conversationId);

  // Layer 1 Security Barrier: stop prompt injections, secret probing, bypasses, and data dumps
  // BEFORE running AI calls, extractors, or modifying conversation stage/bookings.
  if (securityThreat.blocked) {
    const blockedReply = sanitizeAssistantOutput(securityThreat.response);
    await ConversationModel.addMessage(conversationId, 'assistant', blockedReply);
    const unchangedConv = await ConversationModel.getConversation(conversationId);
    const safeQuickReplies =
      unchangedConv.stage === STAGES.AWAIT_CUSTOMER_CONFIRMATION
        ? ['Yes, confirm booking', 'Change date or time', 'Edit my details']
        : unchangedConv.stage === STAGES.BOOKING_CONFIRMED
        ? ['Check booking status']
        : ['Explore Dasceq services', 'Schedule an appointment'];

    const blockedAi = getAiRuntimeStatus();

    return {
      message: blockedReply,
      stage: unchangedConv.stage,
      customerInfo: unchangedConv.customerInfo,
      appointmentDetails: unchangedConv.appointmentDetails,
      availableSlots: null,
      quickReplies: safeQuickReplies,
      bookingRef: unchangedConv.bookingRef,
      appointment: null,
      aiProvider: blockedAi.activeProvider,
      aiStatus: blockedAi.status,
      aiModel: blockedAi.model,
      securityBlocked: true,
    };
  }

  const context = {
    stage: conversation.stage,
    lastPromptField: conversation.lastPromptField,
    followUpAsked: Boolean(conversation.followUpAsked),
    customerInfo: { ...conversation.customerInfo },
    appointmentDetails: { ...conversation.appointmentDetails },
  };

  if (
    conversation.stage === STAGES.CHECK_AVAILABILITY &&
    conversation.appointmentDetails?.date
  ) {
    const avail = await appointmentService.getAvailability(conversation.appointmentDetails.date);
    if (avail.success && !avail.data.isWeekend) {
      context.availableSlots = avail.data.slots;
    }
  }

  // Run deterministic extractor first
  const det = extractDeterministicInfo(userMessage, context);
  const effectiveInfoPreview = {
    name: context.customerInfo.name || det.info.name,
    phone: context.customerInfo.phone || det.info.phone,
    email: context.customerInfo.email || det.info.email,
    enquiryPurpose: context.customerInfo.enquiryPurpose || det.info.enquiryPurpose,
  };
  context.missingFields = getMissingCustomerFields(effectiveInfoPreview);
  context.detExtractedThisTurn = det.info;

  const isBookingRefMessage =
    Boolean(det.info.bookingRef) ||
    det.requestedBookingLookup ||
    (conversation.lastPromptField === 'bookingRef' && /^DSQ-[A-Z0-9]{4,10}$/i.test(userMessage));

  const hasDeterministicError = Object.keys(det.validationErrors || {}).length > 0;
  // Bypass extra AI latency on deterministic turns (post-booking, lookups, verified company/off-topic queries, validation errors, confirmation gate, slot picks)
  const isDeterministicSchedulingTurn =
    (conversation.stage === STAGES.AWAIT_CUSTOMER_CONFIRMATION &&
      (det.intent === 'confirm_booking' || det.intent === 'reject_booking') &&
      !det.isEditRequest) ||
    (conversation.stage === STAGES.COLLECT_APPOINTMENT_PREFERENCES && Boolean(det.info.date)) ||
    (conversation.stage === STAGES.CHECK_AVAILABILITY && Boolean(det.info.time));

  const skipAiCall =
    conversation.stage === STAGES.BOOKING_CONFIRMED ||
    isBookingRefMessage ||
    Boolean(det.specialQuery) ||
    hasDeterministicError ||
    isDeterministicSchedulingTurn;

  const aiResult = skipAiCall
    ? null
    : await aiProvider.generateResponse(updatedWithUserMsg.messages, context);

  if (aiResult?.response) {
    aiResult.response = sanitizeAssistantOutput(aiResult.response);
  }

  const runtimeAi = getAiRuntimeStatus();
  const activeProvider = aiResult?.provider || runtimeAi.activeProvider;
  const activeAiStatus = aiResult?.aiStatus || runtimeAi.status;
  const activeAiModel = aiResult?.model !== undefined ? aiResult.model : runtimeAi.model;

  const finishTurn = async ({
    message,
    stage,
    customerInfo,
    appointmentDetails,
    followUpAsked,
    lastPromptField,
    bookingRef,
    appointment = null,
    availableSlots = null,
    quickReplies = [],
  }) => {
    const safeMessage = sanitizeAssistantOutput(message);
    const updates = {};
    if (stage !== undefined) updates.stage = stage;
    if (customerInfo !== undefined) updates.customerInfo = customerInfo;
    if (appointmentDetails !== undefined) updates.appointmentDetails = appointmentDetails;
    if (followUpAsked !== undefined) updates.followUpAsked = followUpAsked;
    if (lastPromptField !== undefined) updates.lastPromptField = lastPromptField;
    if (bookingRef !== undefined) updates.bookingRef = bookingRef;

    if (Object.keys(updates).length > 0) {
      await ConversationModel.updateConversation(conversationId, updates);
    }

    await ConversationModel.addMessage(conversationId, 'assistant', safeMessage);
    const finalConv = await ConversationModel.getConversation(conversationId);

    return {
      message: safeMessage,
      stage: finalConv.stage,
      customerInfo: finalConv.customerInfo,
      appointmentDetails: finalConv.appointmentDetails,
      availableSlots,
      quickReplies,
      bookingRef: finalConv.bookingRef,
      appointment,
      aiProvider: activeProvider,
      aiStatus: activeAiStatus,
      aiModel: activeAiModel,
    };
  };

  // ── 1. Booking Status Lookup (supports "Check booking status" prompt & DSQ-XXXXXX) ──
  const lookupRef =
    det.info.bookingRef ||
    aiResult?.extractedInfo?.bookingRef ||
    (conversation.lastPromptField === 'bookingRef' && /^DSQ-[A-Z0-9]{4,10}$/i.test(userMessage)
      ? userMessage.trim().toUpperCase()
      : null);

  if (lookupRef) {
    const found = await appointmentService.getAppointment(lookupRef);
    if (found.success) {
      const appt = found.data;
      return finishTurn({
        message: `Here are the details for booking **${appt.bookingRef}** (${appt.status}):\n\n• **Name:** ${appt.customerInfo.name}\n• **Phone:** ${appt.customerInfo.phone}\n• **Email:** ${appt.customerInfo.email}\n• **Purpose:** ${appt.customerInfo.enquiryPurpose}\n• **Date:** ${appt.displayDate}\n• **Time:** ${appt.displayTime} IST`,
        appointment: appt,
        lastPromptField: null,
      });
    }
    return finishTurn({
      message: `I couldn't find an appointment with reference **${lookupRef}**. Please double-check your reference (format: DSQ-XXXXXX) or start a new booking.`,
      lastPromptField: 'bookingRef',
    });
  }

  if (det.requestedBookingLookup || aiResult?.intent === 'check_status') {
    return finishTurn({
      message:
        'Sure! Please share your booking reference (for example, **DSQ-AB12CD**) and I will look up your appointment details right away.',
      lastPromptField: 'bookingRef',
    });
  }

  // ── 2. Already confirmed conversation ──
  if (conversation.stage === STAGES.BOOKING_CONFIRMED) {
    return finishTurn({
      message: `Your appointment is already confirmed under reference **${conversation.bookingRef}**. You can share any **DSQ-XXXXXX** reference to check a booking, or click **New Chat** above to start another enquiry.`,
      quickReplies: ['Check booking status'],
    });
  }

  // ── 3. Merge extracted customer info (allowing updates on edit or correction) ──
  const updatedCustomerInfo = { ...conversation.customerInfo };
  const validationErrors = { ...(det.validationErrors || {}) };
  const allowOverwrite =
    det.isEditRequest ||
    aiResult?.intent === 'edit_details' ||
    conversation.stage === STAGES.VALIDATE_DETAILS;

  // Handle inline edit target phrases like "change my name to Sunil Kumar"
  if (det.editTargetField) {
    const inlineVal = extractInlineEditValue(userMessage, det.editTargetField);
    if (inlineVal) {
      if (det.editTargetField === 'name') det.info.name = inlineVal;
      if (det.editTargetField === 'enquiryPurpose') det.info.enquiryPurpose = inlineVal;
    }
  }

  const greetingOnly = customerService.isGreetingOnly(userMessage);
  const isOffTopicOrInfo =
    Boolean(det.specialQuery) || aiResult?.intent === 'off_topic' || aiResult?.intent === 'company_info';
  const rawAiName = greetingOnly ? null : aiResult?.extractedInfo?.name;
  const safeAiName =
    rawAiName && !TECHNICAL_OR_ENQUIRY_WORDS.test(rawAiName) ? rawAiName : null;

  const candidateName = det.info.name || safeAiName;
  const candidatePhone = det.info.phone || aiResult?.extractedInfo?.phone;
  const candidateEmail = det.info.email || aiResult?.extractedInfo?.email;
  const candidatePurpose =
    det.info.enquiryPurpose ||
    (greetingOnly || isOffTopicOrInfo ? null : aiResult?.extractedInfo?.enquiryPurpose);
  const candidateFollowUp =
    det.info.followUpNotes ||
    (greetingOnly || isOffTopicOrInfo ? null : aiResult?.extractedInfo?.followUpNotes);

  const newlySaved = [];

  if (candidateName && (!updatedCustomerInfo.name || allowOverwrite || det.info.name)) {
    const check = customerService.validateName(candidateName);
    if (check.valid) {
      if (updatedCustomerInfo.name !== check.cleaned) newlySaved.push('name');
      updatedCustomerInfo.name = check.cleaned;
      delete validationErrors.name;
    } else if (det.info.name || conversation.lastPromptField === 'name') {
      validationErrors.name = check.error;
    }
  }

  if (candidatePhone && (!updatedCustomerInfo.phone || allowOverwrite || det.info.phone)) {
    const check = customerService.validatePhone(candidatePhone);
    if (check.valid) {
      if (updatedCustomerInfo.phone !== check.cleaned) newlySaved.push('phone');
      updatedCustomerInfo.phone = check.cleaned;
      delete validationErrors.phone;
    } else if (det.info.phone || conversation.lastPromptField === 'phone') {
      validationErrors.phone = check.error;
    }
  }

  if (candidateEmail && (!updatedCustomerInfo.email || allowOverwrite || det.info.email)) {
    const check = customerService.validateEmail(candidateEmail);
    if (check.valid) {
      if (updatedCustomerInfo.email !== check.cleaned) newlySaved.push('email');
      updatedCustomerInfo.email = check.cleaned;
      delete validationErrors.email;
    } else if (det.info.email || conversation.lastPromptField === 'email') {
      validationErrors.email = check.error;
    }
  }

  const knownCustomerName = updatedCustomerInfo.name || candidateName || null;

  if (candidatePurpose && !updatedCustomerInfo.enquiryPurpose) {
    const check = customerService.validatePurpose(candidatePurpose, {
      knownName: knownCustomerName,
    });
    if (check.valid) {
      updatedCustomerInfo.enquiryPurpose = check.cleaned;
      newlySaved.push('enquiryPurpose');
    }
  } else if (
    candidatePurpose &&
    (allowOverwrite ||
      det.editTargetField === 'enquiryPurpose' ||
      GENERIC_PURPOSES.has((updatedCustomerInfo.enquiryPurpose || '').toLowerCase()))
  ) {
    const check = customerService.validatePurpose(candidatePurpose, {
      knownName: knownCustomerName,
    });
    if (
      check.valid &&
      (allowOverwrite || det.editTargetField === 'enquiryPurpose' || !check.isGenericScheduling)
    ) {
      updatedCustomerInfo.enquiryPurpose = check.cleaned;
      newlySaved.push('enquiryPurpose');
    }
  }

  // Enrich purpose with follow-up notes when answering contextual follow-up (never accept person names or vague non-answers)
  const isVagueNonTopicReply =
    typeof candidateFollowUp === 'string' &&
    /^(yes|no|nope|nah|ok|okay|sure|nothing|none|not really|just booking|any|schedule now|please book)[.!\s]*$/i.test(
      candidateFollowUp.trim()
    );

  if (
    candidateFollowUp &&
    !det.info.name &&
    !safeAiName &&
    !det.info.phone &&
    !det.info.email &&
    !isVagueNonTopicReply &&
    !customerService.looksLikePersonNameOnly(candidateFollowUp, knownCustomerName)
  ) {
    const enriched = customerService.validatePurpose(candidateFollowUp, {
      knownName: knownCustomerName,
    });
    if (enriched.valid && !enriched.isPersonName) {
      updatedCustomerInfo.followUpNotes = candidateFollowUp;
      const existingPurpose = updatedCustomerInfo.enquiryPurpose || '';
      if (GENERIC_PURPOSES.has(existingPurpose.toLowerCase())) {
        if (!enriched.isGenericScheduling) {
          updatedCustomerInfo.enquiryPurpose = enriched.cleaned;
        }
      } else if (
        existingPurpose &&
        !existingPurpose.toLowerCase().includes(candidateFollowUp.toLowerCase()) &&
        existingPurpose.length + candidateFollowUp.length < 180
      ) {
        updatedCustomerInfo.enquiryPurpose = `${existingPurpose} (${candidateFollowUp})`;
      }
    }
  }

  // Merge date/time extraction (deterministic takes priority; fallback to AI normalized values)
  const candidateDate = det.info.date || aiResult?.extractedInfo?.date || null;
  const candidateTime = det.info.time || aiResult?.extractedInfo?.time || null;

  // ── 4. Explicit Validation Error Feedback (never silently ignore invalid input) ──
  const errorKeys = Object.keys(validationErrors);
  if (errorKeys.length > 0) {
    const errorMessages = errorKeys.map((k) => `⚠️ ${validationErrors[k]}`).join('\n');
    const ack =
      newlySaved.length > 0
        ? `I've saved your ${newlySaved.join(', ')}. However:\n\n`
        : '';
    return finishTurn({
      message: `${ack}${errorMessages}`,
      customerInfo: updatedCustomerInfo,
      lastPromptField: errorKeys[0],
    });
  }

  // ── 4b. Verified Company Info / Off-Topic Redirect (never stored as enquiryPurpose) ──
  if (det.specialQuery || aiResult?.intent === 'off_topic') {
    const specialReply =
      det.specialQuery
        ? buildSpecialQueryResponse(det.specialQuery)
        : aiResult?.response || buildSpecialQueryResponse({ type: 'off_topic' });

    const suffix =
      conversation.stage === STAGES.AWAIT_CUSTOMER_CONFIRMATION
        ? '\n\nWhenever you are ready, please reply **Yes** to confirm your pending appointment or **No** to make changes.'
        : '';

    const specialQuickReplies =
      conversation.stage === STAGES.AWAIT_CUSTOMER_CONFIRMATION
        ? ['Yes, confirm booking', 'Change date or time', 'Edit my details']
        : det.specialQuery?.type === 'company_info'
        ? ['Schedule an appointment', 'Product enquiry', 'General support']
        : ['Explore Dasceq services', 'Schedule an appointment', 'Product enquiry'];

    return finishTurn({
      message: `${specialReply}${suffix}`,
      customerInfo: updatedCustomerInfo,
      quickReplies: specialQuickReplies,
    });
  }

  // ── 5. Explicit Edit Intent Without Inline Value ──
  if (
    (det.isEditRequest || aiResult?.intent === 'edit_details') &&
    newlySaved.length === 0 &&
    !candidateDate &&
    !candidateTime
  ) {
    if (det.editTargetField === 'time' && conversation.appointmentDetails?.date) {
      const existingDate = conversation.appointmentDetails.date;
      const avail = await appointmentService.getAvailability(existingDate);
      if (avail.success && !avail.data.isWeekend && avail.data.slots.length > 0) {
        return finishTurn({
          message: `Sure! Let's pick a new time for **${avail.data.displayDate}** (${avail.data.slots.length} available):\n\n${formatSlotSummaryList(
            avail.data.slots
          )}\n\nWhich time works best for you?`,
          stage: STAGES.CHECK_AVAILABILITY,
          customerInfo: updatedCustomerInfo,
          appointmentDetails: { date: existingDate, time: null, slotId: null },
          availableSlots: avail.data.slots,
          quickReplies: avail.data.slots.slice(0, 8).map((s) => s.displayTime),
          lastPromptField: 'time',
        });
      }
    }

    if (det.editTargetField === 'date' || det.editTargetField === 'time') {
      return finishTurn({
        message: 'Sure! What new date and time would you prefer for your appointment?',
        stage: STAGES.COLLECT_APPOINTMENT_PREFERENCES,
        customerInfo: updatedCustomerInfo,
        appointmentDetails: { date: null, time: null, slotId: null },
        lastPromptField: 'date',
      });
    }

    if (det.editTargetField && ['name', 'phone', 'email', 'enquiryPurpose'].includes(det.editTargetField)) {
      updatedCustomerInfo[det.editTargetField] = null;
      const { prompt, field } = promptForMissingField(det.editTargetField);
      return finishTurn({
        message: `No problem! ${prompt}`,
        stage: STAGES.COLLECT_CUSTOMER_DETAILS,
        customerInfo: updatedCustomerInfo,
        lastPromptField: field,
      });
    }

    return finishTurn({
      message:
        'Sure! Which detail would you like to update — **Name**, **Phone**, **Email**, **Purpose**, or **Date/Time**?',
      stage:
        conversation.stage === STAGES.AWAIT_CUSTOMER_CONFIRMATION
          ? STAGES.AWAIT_CUSTOMER_CONFIRMATION
          : STAGES.COLLECT_CUSTOMER_DETAILS,
      customerInfo: updatedCustomerInfo,
      lastPromptField: null,
      quickReplies: ['Change date or time', 'Change my name', 'Change my phone', 'Change my email'],
    });
  }

  // ── 6. Strict AWAIT_CUSTOMER_CONFIRMATION Gate ──
  if (conversation.stage === STAGES.AWAIT_CUSTOMER_CONFIRMATION) {
    const currentAppt = conversation.appointmentDetails;

    // If user edited a customer detail inline while on confirmation summary, show updated summary
    if (newlySaved.length > 0 && !candidateDate && !candidateTime) {
      return finishTurn({
        message: `Updated your ${newlySaved.join(', ')}!\n\n${buildPreConfirmationSummary(
          updatedCustomerInfo,
          currentAppt.date,
          currentAppt.time
        )}`,
        stage: STAGES.AWAIT_CUSTOMER_CONFIRMATION,
        customerInfo: updatedCustomerInfo,
        lastPromptField: 'confirmation',
        quickReplies: ['Yes, confirm booking', 'Change date or time', 'Edit my details'],
      });
    }

    // If user rejects or asks to change/cancel BEFORE checking confirm!
    const isRejected =
      det.intent === 'reject_booking' ||
      aiResult?.intent === 'reject_booking' ||
      /\b(no|nope|nah|cancel|change|different|another|reschedule|edit|wrong|wait)\b/i.test(
        userMessage
      );

    if (isRejected && !candidateDate && !candidateTime) {
      return finishTurn({
        message:
          'No problem — I have **not** booked the appointment yet. Would you like to pick a different date or time, or update your contact details?',
        stage: STAGES.COLLECT_APPOINTMENT_PREFERENCES,
        customerInfo: updatedCustomerInfo,
        appointmentDetails: { date: null, time: null, slotId: null },
        lastPromptField: 'date',
        quickReplies: ['Pick another date', 'Edit my details'],
      });
    }

    // If user explicitly confirms
    const isConfirmed =
      !isRejected &&
      (det.intent === 'confirm_booking' ||
        aiResult?.intent === 'confirm_booking' ||
        /^(yes|yep|yeah|yup|confirm|confirmed|sure|ok|okay|book it|go ahead|proceed)\b/i.test(
          userMessage.trim()
        ));

    if (isConfirmed && !candidateDate && !candidateTime) {
      const bookingResult = await appointmentService.createAppointment({
        conversationId,
        customerInfo: updatedCustomerInfo,
        date: currentAppt.date,
        time: currentAppt.time,
      });

      if (bookingResult.success) {
        const booked = bookingResult.data;
        return finishTurn({
          message: buildFinalBookingConfirmation(booked),
          stage: STAGES.BOOKING_CONFIRMED,
          customerInfo: updatedCustomerInfo,
          bookingRef: booked.bookingRef,
          appointment: booked,
          lastPromptField: null,
        });
      }

      // Slot conflict or duplicate booking
      return finishTurn({
        message: `⚠️ I couldn't complete the booking: ${bookingResult.error}\n\nWould you like to select another date or time?`,
        stage: STAGES.COLLECT_APPOINTMENT_PREFERENCES,
        customerInfo: updatedCustomerInfo,
        appointmentDetails: { date: null, time: null, slotId: null },
        lastPromptField: 'date',
      });
    }

    // If user supplied a new date/time directly while on confirmation screen, fall through to scheduling logic below!
    if (!candidateDate && !candidateTime) {
      return finishTurn({
        message: `Please reply **Yes** to confirm your booking or **No** to change the date, time, or details.\n\n${buildPreConfirmationSummary(
          updatedCustomerInfo,
          currentAppt.date,
          currentAppt.time
        )}`,
        stage: STAGES.AWAIT_CUSTOMER_CONFIRMATION,
        customerInfo: updatedCustomerInfo,
        lastPromptField: 'confirmation',
        quickReplies: ['Yes, confirm booking', 'Change date or time', 'Edit my details'],
      });
    }
  }

  // ── 7. Greeting-only on initial turn ──
  if (
    !updatedCustomerInfo.enquiryPurpose &&
    customerService.isGreetingOnly(userMessage)
  ) {
    const reply =
      activeProvider === 'gemini' && aiResult?.response
        ? aiResult.response
        : "Hello! 😊 I'd be happy to help you today. Could you tell me what your enquiry is about or if you'd like to schedule an appointment?";
    return finishTurn({
      message: reply,
      stage: STAGES.UNDERSTAND_INTENT,
      customerInfo: updatedCustomerInfo,
      lastPromptField: 'purpose',
    });
  }

  // ── 8. Context-Aware Follow-Up Question (once purpose is captured) ──
  const missingFields = getMissingCustomerFields(updatedCustomerInfo);
  if (
    updatedCustomerInfo.enquiryPurpose &&
    !conversation.followUpAsked &&
    !candidateFollowUp &&
    !(missingFields.length === 0 && (candidateDate || candidateTime))
  ) {
    // Guard against Gemini jumping straight to contact prompts before asking about the enquiry topic,
    // which otherwise leaves `lastPromptField: 'followUp'` mismatched when the customer replies with their name.
    const aiAskedContactPrematurely =
      activeProvider === 'gemini' &&
      aiResult?.response &&
      /\b(full\s+name|your\s+name|phone\s+number|mobile\s+number|contact\s+number|email\s+address|your\s+email)\b/i.test(
        aiResult.response
      );

    const followUpMessage =
      activeProvider === 'gemini' && aiResult?.response && !aiAskedContactPrematurely
        ? aiResult.response
        : buildContextualFollowUp(updatedCustomerInfo.enquiryPurpose, userMessage);

    return finishTurn({
      message: followUpMessage,
      stage: STAGES.COLLECT_CUSTOMER_DETAILS,
      customerInfo: updatedCustomerInfo,
      followUpAsked: true,
      lastPromptField: 'followUp',
    });
  }

  // ── 9. Collect Missing Customer Details (ask only for what is missing) ──
  if (missingFields.length > 0) {
    const nextField = missingFields[0];
    const { prompt, field } = promptForMissingField(nextField);

    let ack = '';
    const isSameFieldReprompt =
      conversation.lastPromptField &&
      (conversation.lastPromptField === field ||
        (conversation.lastPromptField === 'purpose' && field === 'enquiryPurpose'));

    if (newlySaved.includes('name')) {
      ack = `Thanks, ${updatedCustomerInfo.name}! `;
    } else if (newlySaved.includes('phone')) {
      ack = 'Got your phone number! ';
    } else if (newlySaved.includes('email')) {
      ack = 'Thanks for sharing your email! ';
    } else if (candidateFollowUp || newlySaved.includes('enquiryPurpose')) {
      ack = 'Thank you for sharing those details! ';
    } else if (isSameFieldReprompt && !customerService.isGreetingOnly(userMessage)) {
      // Unclear reply to a specific field prompt
      ack = `I didn't quite catch that. `;
    }

    let reply = `${ack}${prompt}`;
    let promptField = field;
    const fieldQuickReplies =
      field === 'enquiryPurpose'
        ? ['Schedule an appointment', 'Product enquiry', 'General support', 'Explore Dasceq services']
        : [];

    if (field === 'enquiryPurpose' && ack.includes("didn't quite catch")) {
      reply =
        "I didn't quite catch what your enquiry is about. Could you briefly tell me how we can help you today (for example: product enquiry, AI consulting, technical support, or booking an appointment)?";
    } else if (activeProvider === 'gemini' && aiResult?.response && !ack.includes("didn't quite catch")) {
      const askedField = missingFields.find((f) => FIELD_PATTERNS[f]?.test(aiResult.response));
      if (askedField) {
        reply = aiResult.response;
        promptField = askedField;
      } else {
        reply = `${aiResult.response}\n\n${prompt}`;
        promptField = field;
      }
    }

    return finishTurn({
      message: reply,
      stage: updatedCustomerInfo.enquiryPurpose
        ? STAGES.COLLECT_CUSTOMER_DETAILS
        : STAGES.UNDERSTAND_INTENT,
      customerInfo: updatedCustomerInfo,
      followUpAsked: Boolean(conversation.followUpAsked || updatedCustomerInfo.enquiryPurpose),
      lastPromptField: promptField,
      quickReplies: promptField === 'enquiryPurpose' ? fieldQuickReplies : [],
    });
  }

  // ── 10. All 4 Customer Details Collected -> Appointment Date & Time Scheduling ──
  const existingAppt = conversation.appointmentDetails || {};
  const targetDate = candidateDate || existingAppt.date || null;
  const targetTime = candidateTime || (candidateDate ? null : existingAppt.time) || null;

  // No date yet -> ask for preferred date
  if (!targetDate) {
    const intro =
      newlySaved.length > 0 || conversation.stage === STAGES.COLLECT_CUSTOMER_DETAILS
        ? `Thank you, ${updatedCustomerInfo.name}! I have all your contact details.\n\n`
        : conversation.stage === STAGES.COLLECT_APPOINTMENT_PREFERENCES
        ? "I couldn't recognize a valid date from your message. "
        : '';

    return finishTurn({
      message: `${intro}When would you like to schedule your appointment? 📅\n\nYou can reply with a natural date like **"tomorrow"**, **"next Monday"**, **"16 Nov"**, or **YYYY-MM-DD**.\nOur working hours are **Monday to Friday, 9:00 AM – 6:00 PM IST**.`,
      stage: STAGES.COLLECT_APPOINTMENT_PREFERENCES,
      customerInfo: updatedCustomerInfo,
      followUpAsked: true,
      lastPromptField: 'date',
    });
  }

  // Validate date & fetch real availability from backend service
  const availability = await appointmentService.getAvailability(targetDate);
  if (!availability.success) {
    return finishTurn({
      message: `⚠️ ${availability.error}\n\nPlease choose today or a future weekday (Monday–Friday, e.g., **"tomorrow"** or **"next Monday"**).`,
      stage: STAGES.COLLECT_APPOINTMENT_PREFERENCES,
      customerInfo: updatedCustomerInfo,
      appointmentDetails: { date: null, time: null, slotId: null },
      lastPromptField: 'date',
    });
  }

  if (availability.data.isWeekend) {
    return finishTurn({
      message: `⚠️ ${availability.data.message}`,
      stage: STAGES.COLLECT_APPOINTMENT_PREFERENCES,
      customerInfo: updatedCustomerInfo,
      appointmentDetails: { date: null, time: null, slotId: null },
      lastPromptField: 'date',
    });
  }

  const realSlots = availability.data.slots;
  if (realSlots.length === 0) {
    return finishTurn({
      message: `Sorry, there are no remaining slots available on **${availability.data.displayDate}**. Please select another weekday.`,
      stage: STAGES.COLLECT_APPOINTMENT_PREFERENCES,
      customerInfo: updatedCustomerInfo,
      appointmentDetails: { date: null, time: null, slotId: null },
      lastPromptField: 'date',
    });
  }

  // Date is valid & has real available slots; if no time chosen yet, show real slots
  if (!targetTime) {
    const wantsMorning = /\bmorning\b/i.test(userMessage);
    const wantsAfternoon = /\b(afternoon|evening)\b/i.test(userMessage);
    const filteredSlots = wantsMorning
      ? realSlots.filter((s) => parseInt(s.time.split(':')[0], 10) < 12)
      : wantsAfternoon
      ? realSlots.filter((s) => parseInt(s.time.split(':')[0], 10) >= 12)
      : realSlots;
    const displaySlots = filteredSlots.length > 0 ? filteredSlots : realSlots;

    const notePrefix =
      conversation.stage === STAGES.CHECK_AVAILABILITY &&
      !candidateDate &&
      !/\b(morning|afternoon|evening)\b/i.test(userMessage)
        ? "I didn't catch a specific time from your message. "
        : '';

    return finishTurn({
      message: `${notePrefix}Here are the available slots for **${availability.data.displayDate}** (${realSlots.length} available):\n\n${formatSlotSummaryList(
        displaySlots
      )}\n\nWhich time works best for you? (For example, **10:00 AM** or **2:30 PM**)`,
      stage: STAGES.CHECK_AVAILABILITY,
      customerInfo: updatedCustomerInfo,
      appointmentDetails: { date: targetDate, time: null, slotId: null },
      availableSlots: displaySlots,
      quickReplies: displaySlots.slice(0, 8).map((s) => s.displayTime),
      lastPromptField: 'time',
    });
  }

  // Validate chosen time against 30-min grid & real availability
  if (!availabilityService.isValidSlotTime(targetTime)) {
    return finishTurn({
      message: `⚠️ **${formatTime(
        targetTime
      )}** is not a valid booking slot. Appointments are available in 30-minute intervals between **9:00 AM and 5:30 PM IST**.\n\nAvailable slots for **${
        availability.data.displayDate
      }**:\n\n${formatSlotSummaryList(realSlots)}\n\nPlease pick one of the available times.`,
      stage: STAGES.CHECK_AVAILABILITY,
      customerInfo: updatedCustomerInfo,
      appointmentDetails: { date: targetDate, time: null, slotId: null },
      availableSlots: realSlots,
      quickReplies: realSlots.slice(0, 8).map((s) => s.displayTime),
      lastPromptField: 'time',
    });
  }

  const slotFree = await availabilityService.isSlotAvailable(targetDate, targetTime);
  if (!slotFree) {
    return finishTurn({
      message: `⚠️ Sorry, **${formatTime(targetTime)}** on **${
        availability.data.displayDate
      }** is unavailable (already booked or in the past).\n\nPlease choose from these available slots:\n\n${formatSlotSummaryList(
        realSlots
      )}`,
      stage: STAGES.CHECK_AVAILABILITY,
      customerInfo: updatedCustomerInfo,
      appointmentDetails: { date: targetDate, time: null, slotId: null },
      availableSlots: realSlots,
      quickReplies: realSlots.slice(0, 8).map((s) => s.displayTime),
      lastPromptField: 'time',
    });
  }

  // Both date & time are valid and available -> MUST enter AWAIT_CUSTOMER_CONFIRMATION!
  return finishTurn({
    message: buildPreConfirmationSummary(updatedCustomerInfo, targetDate, targetTime),
    stage: STAGES.AWAIT_CUSTOMER_CONFIRMATION,
    customerInfo: updatedCustomerInfo,
    appointmentDetails: { date: targetDate, time: targetTime, slotId: null },
    quickReplies: ['Yes, confirm booking', 'Change date or time', 'Edit my details'],
    lastPromptField: 'confirmation',
  });
}

/**
 * Get a conversation by ID
 */
async function getConversation(conversationId) {
  return ConversationModel.getConversation(conversationId);
}

module.exports = {
  startConversation,
  processMessage,
  getConversation,
  getActiveAiProviderName,
  getAiRuntimeStatus,
  verifyAiProviderStartup,
};
