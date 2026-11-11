/**
 * Customer input validation, sanitization, and name/purpose disambiguation service.
 * Enforces Indian mobile format (`+91`/leading `0` normalized to 10 digits starting 6-9),
 * valid email syntax, non-name keyword filtering (`tomorrow`, `Monday`, `hello`),
 * and strict separation between person names and enquiry topics.
 */

// Words commonly mistyped/spoken into name prompts that must be rejected as names or purposes
const NON_NAME_WORDS = new Set([
  'yes', 'yep', 'yeah', 'yup', 'no', 'nope', 'nah', 'hi', 'hello', 'hey', 'hii', 'greetings',
  'sure', 'thanks', 'thank', 'thank you', 'okay', 'ok', 'alright', 'please', 'pls',
  'tomorrow', 'today', 'yesterday', 'monday', 'tuesday', 'wednesday', 'thursday',
  'friday', 'saturday', 'sunday', 'mon', 'tue', 'tues', 'wed', 'thu', 'thur', 'thurs',
  'fri', 'sat', 'sun', 'morning', 'afternoon', 'evening', 'night', 'confirm', 'confirmed',
  'cancel', 'change', 'edit', 'update', 'book', 'booking', 'appointment', 'schedule',
  'support', 'enquiry', 'inquiry', 'help', 'none', 'nothing', 'correct', 'wrong',
]);

const INCOMPLETE_INTRO_REGEX =
  /^(?:my\s+(?:name|full\s+name|phone|mobile|email|number|purpose)\s+is|i\s+am|i['’]?m|this\s+is|call\s+me|name\s+is|phone\s+is|email\s+is)\.?$/i;

const MEANINGLESS_PURPOSE_WORDS = new Set([
  'k', 'ok', 'okay', 'yes', 'yep', 'yeah', 'yup', 'no', 'nope', 'nah',
  'sure', 'maybe', 'idk', 'none', 'nothing', 'any', 'anything', 'something',
  'test', 'testing', 'good', 'fine', 'great', 'cool', 'nice', 'hmm', 'hm',
  'uh', 'um', 'sorry', 'what', 'why', 'who', 'when', 'where', 'how',
]);

const GREETING_ONLY_REGEX =
  /^(hi+|hello+|hey+|hii+|good\s*(morning|afternoon|evening)|namaste|greetings)[!.,\s]*$/i;

const PURPOSE_SIGNAL_REGEX =
  /\b(ai|ml|machine learning|llm|rag|nlp|cloud|aws|azure|gcp|data|analytics|product|pricing|price|cost|quote|estimate|plan|demo|trial|support|help|issue|bug|error|problem|broken|fix|trouble|consultation|consulting|meeting|appointment|schedule|book|booking|project|solution|platform|software|app|mobile|web|website|chatbot|bot|voice|automation|integration|migration|crm|erp|api|database|devops|deployment|security|cybersecurity|blockchain|saas|seo|audit|testing|qa|design|ui|ux|service|services|enquiry|inquiry|timeline|budget|team|company|business|enterprise|startup|retail|healthcare|fintech|finance|tax|accounting|payroll|recruitment|hiring|hr|ecommerce|education|sales|marketing|billing|invoice|refund|payment|account|order|status|interview|job|career|internship|partnership|vendor|training|workshop|onboarding|feedback|complaint|escalation|renewal|subscription|contract|licensing|architecture|performance|optimization|documentation|export|import|login|password|access|feature|custom|agent|dashboard|report|logistics|supply|chain|insurance|banking|telecom|inventory|workflow|retention|lead|leads|customer|client|revenue|compliance|legal|medical|clinic|hospital|dental|checkup|therapy|repair|maintenance|installation|setup|school|college|estate|property|need|want|looking|interested|discuss|build|develop|create|upgrade|improve|general|technical|regarding|about)\b/i;

const GENERIC_SCHEDULING_INTENT_REGEX =
  /^(?:i\s+(?:want|would like|need|wish)\s+to\s+|please\s+|can\s+i\s+)?(?:schedule|book)\s+(?:an?\s+)?(?:appointment|meeting|call|slot|consultation)(?:\s+please)?[.!]*$/i;

const NAME_INTRO_ONLY_REGEX =
  /^(?:(?:hi|hello|hey)[,!\s]*)?(?:my name is|i['’]?m|i am|this is|call me|name\s*(?:is|:))\s+([a-zA-Z][a-zA-Z\s'.-]{1,60})$/i;

/**
 * Validate Indian mobile phone number (10 digits, starts with 6-9)
 */
function validatePhone(phone) {
  if (!phone || typeof phone !== 'string') {
    return { valid: false, error: 'Phone number is required.' };
  }

  const trimmed = phone.trim();
  const hasLetters = /[a-zA-Z]/.test(trimmed);
  if (hasLetters) {
    return {
      valid: false,
      error: 'Phone number should contain digits only (e.g., 9876543210 or +91 9876543210).',
    };
  }

  const digitsOnly = trimmed.replace(/\D/g, '');
  let digits = digitsOnly;

  if (digits.startsWith('91') && digits.length === 12) {
    digits = digits.substring(2);
  } else if (digits.startsWith('0') && digits.length === 11) {
    digits = digits.substring(1);
  }

  if (digits.length !== 10) {
    return {
      valid: false,
      error: `Phone number must be 10 digits (got ${digits.length}). Please enter a valid 10-digit Indian mobile number (e.g., 9876543210).`,
    };
  }

  if (!/^[6-9]/.test(digits)) {
    return {
      valid: false,
      error: 'Indian mobile numbers must start with 6, 7, 8, or 9 (e.g., 9876543210).',
    };
  }

  return { valid: true, cleaned: digits };
}

/**
 * Validate email address
 */
function validateEmail(email) {
  if (!email || typeof email !== 'string') {
    return { valid: false, error: 'Email address is required.' };
  }

  const trimmed = email.trim().toLowerCase();
  const emailRegex = /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/;

  if (!emailRegex.test(trimmed) || trimmed.includes('..')) {
    return {
      valid: false,
      error: 'Please enter a valid email address (for example, name@example.com).',
    };
  }

  return { valid: true, cleaned: trimmed };
}

/**
 * Validate customer name
 */
function validateName(name) {
  if (!name || typeof name !== 'string') {
    return { valid: false, error: 'Full name is required.' };
  }

  const trimmed = name.trim().replace(/\s+/g, ' ');

  if (trimmed.length < 2) {
    return { valid: false, error: 'Name must be at least 2 characters long.' };
  }

  if (trimmed.length > 100) {
    return { valid: false, error: 'Name must be 100 characters or less.' };
  }

  if (!/^[a-zA-Z][a-zA-Z\s'.-]*$/.test(trimmed)) {
    return {
      valid: false,
      error: 'Name should contain letters only (spaces, apostrophes, hyphens, and periods allowed).',
    };
  }

  const lower = trimmed.toLowerCase();
  const tokens = lower.split(/\s+/);
  if (
    NON_NAME_WORDS.has(lower) ||
    tokens.every((t) => NON_NAME_WORDS.has(t)) ||
    INCOMPLETE_INTRO_REGEX.test(trimmed)
  ) {
    return {
      valid: false,
      error: `"${trimmed}" doesn't look like a person's name. Please share your full name.`,
    };
  }

  // Normalize all-lowercase input (e.g., "rahul sharma" -> "Rahul Sharma")
  const normalized = trimmed === lower
    ? tokens.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
    : trimmed;

  return { valid: true, cleaned: normalized };
}

/**
 * Detect whether text looks like a person's name rather than an enquiry topic.
 * Prevents short bare names (e.g. "Gaurav Pawar") answered during topic/follow-up prompts
 * from being recorded as the appointment purpose.
 */
function looksLikePersonNameOnly(text, knownName = null) {
  if (!text || typeof text !== 'string') return false;
  const trimmed = text.trim().replace(/\s+/g, ' ');
  if (!trimmed) return false;

  if (knownName && trimmed.toLowerCase() === String(knownName).trim().toLowerCase()) {
    return true;
  }

  // Explicit intro like "My name is Gaurav Pawar" with no enquiry/domain signals
  const introMatch = trimmed.match(NAME_INTRO_ONLY_REGEX);
  if (introMatch && !PURPOSE_SIGNAL_REGEX.test(trimmed)) {
    return validateName(introMatch[1]).valid;
  }

  // Once a customer's name is already captured, don't reject unrelated short domain phrases
  if (knownName) {
    return false;
  }

  // Bare 1-4 word alphabetic string matching name grammar with zero enquiry/topic keywords
  if (PURPOSE_SIGNAL_REGEX.test(trimmed)) {
    return false;
  }

  const tokens = trimmed.split(/\s+/);
  if (tokens.length > 4) return false;

  return validateName(trimmed).valid;
}

/**
 * Validate and normalize enquiry purpose.
 * Rejects greetings/names and maps generic booking phrases ("Schedule an appointment")
 * to "Appointment scheduling" with `isGenericScheduling: true` so follow-ups can still refine it.
 */
function validatePurpose(purpose, { knownName = null } = {}) {
  if (!purpose || typeof purpose !== 'string') {
    return { valid: false, error: 'Please tell me what your enquiry is about.' };
  }

  const trimmed = purpose.trim().replace(/\s+/g, ' ');
  if (trimmed.length < 3 || !/[a-zA-Z]{2,}/.test(trimmed)) {
    return {
      valid: false,
      error: 'Could you briefly describe how we can help you (for example, AI consulting, product enquiry, or technical support)?',
    };
  }

  const normalizedAlpha = trimmed.toLowerCase().replace(/[^a-z\s]/g, '').trim();
  if (
    GREETING_ONLY_REGEX.test(trimmed) ||
    NON_NAME_WORDS.has(trimmed.toLowerCase()) ||
    MEANINGLESS_PURPOSE_WORDS.has(normalizedAlpha) ||
    INCOMPLETE_INTRO_REGEX.test(trimmed)
  ) {
    return {
      valid: false,
      error: 'Could you briefly describe how we can help you (for example, AI consulting, product enquiry, or technical support)?',
    };
  }

  if (looksLikePersonNameOnly(trimmed, knownName)) {
    return {
      valid: false,
      isPersonName: true,
      error: 'It looks like you shared a name rather than the topic of your enquiry. Could you let me know how we can help you today?',
    };
  }

  if (GENERIC_SCHEDULING_INTENT_REGEX.test(trimmed)) {
    return { valid: true, cleaned: 'Appointment scheduling', isGenericScheduling: true };
  }

  const formatted = trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
  return { valid: true, cleaned: formatted };
}

/**
 * Sanitize raw user message without breaking punctuation needed for extraction.
 */
function sanitizeInput(input) {
  if (!input || typeof input !== 'string') return '';

  return input
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    .replace(/<[^>]*>/g, '')
    .trim();
}

function isGreetingOnly(text) {
  if (!text || typeof text !== 'string') return false;
  return GREETING_ONLY_REGEX.test(text.trim());
}

module.exports = {
  validatePhone,
  validateEmail,
  validateName,
  validatePurpose,
  looksLikePersonNameOnly,
  sanitizeInput,
  isGreetingOnly,
  NON_NAME_WORDS,
};
