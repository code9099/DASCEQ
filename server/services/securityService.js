/**
 * Layered backend prompt-injection defense, customer-privacy guard, and output leakage sanitizer.
 *
 * Security design:
 * 1. Treats all customer input (including text inside quotes or code blocks) as untrusted data.
 * 2. Detects & blocks instruction overrides, system-prompt/API-key extraction, role/admin spoofing,
 *    validation/confirmation bypasses, NoSQL/code injection payloads, and bulk customer data requests.
 * 3. Dynamically prevents configured secrets (`GEMINI_API_KEY`, `MONGODB_URI`) and all token formats
 *    (`AIza...`, `AQ....`) from appearing in outgoing replies or diagnostic logs.
 */

const PROMPT_INJECTION_PATTERNS = [
  /\b(?:ignore|disregard|forget|override|bypass|skip|drop|reset)\b.{0,40}\b(?:all\s+)?(?:previous|prior|above|earlier|system|developer|assistant|original|safety|security)\b.{0,30}\b(?:instructions?|prompts?|rules?|directions?|guidelines?|messages?|constraints?)\b/i,
  /\bsystem\s*(?:override|prompt|reset|directive|backdoor)\b/i,
  /\b(?:developer|jailbreak|unrestricted|god|sudo|dan)\s*mode\b/i,
  /\byou\s+are\s+now\s+(?:dan|in\s+developer\s+mode|unrestricted|free\s+from\s+rules|no\s+longer\s+(?:bound|restricted))\b/i,
  /\brepeat\s+(?:everything|all\s+text|the\s+instructions?)\s+(?:above|before)\b/i,
  /<\s*\/?\s*(?:system|instruction|customer_message|developer|assistant_override)\s*>/i,
  /\[(?:SYSTEM|INST|\/INST|OVERRIDE)\]/i,
  /^###\s*(?:SYSTEM|INSTRUCTION|OVERRIDE)\b/im,
];

const SECRET_OR_PROMPT_EXTRACTION_PATTERNS = [
  /\b(?:reveal|show|print|output|repeat|dump|leak|tell\s+me|share|display|expose|give\s+me|what\s+is|read)\b.{0,50}\b(?:system\s+prompt|hidden\s+prompt|system\s+instructions?|prompt\s+template|system\s+rules?|internal\s+(?:prompt|rules?|config|instructions?)|api[\s_-]?key|gemini[\s_-]?api[\s_-]?key|secret\s+key|access\s+token|\.env|environment\s+variables?|env\s+vars?|mongodb[\s_-]?uri|database\s+(?:uri|password|credentials?|connection\s+string)|source\s+code|backend\s+code)\b/i,
  /\b(?:GEMINI_API_KEY|MONGODB_URI|CORS_ORIGIN|process\.env|AIza[0-9A-Za-z_-]{8,}|AQ\.[0-9A-Za-z._-]{15,})\b/,
];

const FAKE_ADMIN_OR_BYPASS_PATTERNS = [
  /\b(?:i\s+am|this\s+is|i'm|acting\s+as|speaking\s+as|logged\s+in\s+as|as)\s+(?:an?\s+|the\s+)?(?:system\s+)?(?:admin|administrator|superuser|root|developer|owner|ceo|dasceq\s+(?:admin|staff|engineer|manager))\b.{0,80}\b(?:skip|bypass|override|ignore|force|book|confirm|approve|disable|show|list|dump|access|without)\b/i,
  /\b(?:admin|executive|developer|manager)\s+override\b/i,
  /\b(?:skip|bypass|disable|ignore)\b.{0,35}\b(?:validation|verification|confirmation|safety|security|business\s+hours|weekend|slot\s+check|phone\s+check|email\s+check)\b/i,
  /\b(?:book|confirm|create|finalize|force)\b.{0,45}\b(?:without\s+(?:confirmation|asking|consent|details|validation)|bypass(?:ing)?\s+confirmation|skip(?:ping)?\s+confirmation)\b/i,
  /\b(?:mark|set|force)\b.{0,25}\b(?:appointment|booking|stage)\b.{0,25}\b(?:confirmed|BOOKING_CONFIRMED|without\s+approval)\b/i,
];

const DATA_EXFILTRATION_PATTERNS = [
  /\b(?:list|show|dump|export|give\s+me|tell\s+me|display|fetch|print|reveal|return|get)\b.{0,40}\b(?:all|every|other|existing|recent|stored|previous)\b.{0,35}\b(?:customers?|users?|clients?|appointments?|bookings?|conversations?|chats?|transcripts?|emails?|phone\s+numbers?|mobile\s+numbers?|contacts?|records?|database|store\.json|collections?)\b/i,
  /\b(?:access|query|inspect|read|dump|drop|modify|delete)\b.{0,30}\b(?:the\s+)?(?:database|mongodb|mongoose|store\.json|appointments?\s+table|conversations?\s+collection|internal\s+(?:db|storage|files?))\b/i,
  /\b(?:what\s+is|give\s+me|show\s+me|tell\s+me|find|share|get)\b.{0,35}\b(?:another\s+customer|other\s+customer|someone\s+else|other\s+user)(?:'s)?\b.{0,30}\b(?:email|phone|number|mobile|details|booking|appointment|data)\b/i,
  /\b(?:what\s+is|give\s+me|show\s+me|tell\s+me|find|share|get)\b.{0,45}\b[a-zA-Z]{2,}(?:\s+[a-zA-Z]{2,})?'s\b.{0,25}\b(?:email|phone|number|mobile|contact|details|booking|appointment|data)\b/i,
  /\bwho\s+(?:booked|scheduled|has\s+an?\s+appointment)\b/i,
  /(?:\$\b(?:where|ne|gt|gte|lt|lte|regex|in|nin|or|and)\b|\{\s*"\$|;\s*DROP\s+TABLE\b|\bUNION\s+SELECT\b)/i,
];

const OUTPUT_LEAK_PATTERNS = [
  /GEMINI_API_KEY/i,
  /MONGODB_URI/i,
  /AIza[0-9A-Za-z_-]{15,}/,
  /AQ\.[0-9A-Za-z._-]{15,}/,
  /mongodb(?:\+srv)?:\/\/[^/\s]+:[^@\s]+@/i,
  /<\/?customer_message>/i,
  /(?:VERIFIED COMPANY PROFILE|COMPANY KNOWLEDGE POLICY)\s*\(/i,
  /CURRENT CONVERSATION CONTEXT:/i,
  /RESPONSE_SCHEMA/i,
  /\bprocess\.env\b/,
];

const SAFE_SECURITY_RESPONSES = {
  prompt_injection:
    "I'm Dasceq's customer enquiry and appointment assistant, and I follow fixed booking and security rules. I can't change those instructions, but I'd be glad to help with enquiries or schedule an appointment for you.",
  secret_extraction:
    "I can't share internal system instructions, configuration details, credentials, or source code. If you'd like help with a Dasceq enquiry or appointment, please let me know how I can assist you!",
  bypass_attempt:
    'For accuracy and security, all appointments must use valid customer contact details, verified business-hour slots, and your explicit confirmation at the summary step — I cannot bypass those checks. Let me know how you would like to proceed.',
  data_exfiltration:
    "For customer privacy and security, I can only look up a single appointment when its specific **DSQ-XXXXXX** booking reference is shared, and I cannot access, list, or share other customers' details or database records.",
};

function getRuntimeSecretLiterals() {
  const secrets = [];
  const rawGemini = (process.env.GEMINI_API_KEY || '').trim();
  if (rawGemini && rawGemini.length >= 12 && rawGemini !== 'your_gemini_api_key_here') {
    secrets.push(rawGemini);
  }
  const rawMongo = (process.env.MONGODB_URI || '').trim();
  if (rawMongo && rawMongo.includes('@') && rawMongo.length >= 16) {
    secrets.push(rawMongo);
  }
  return secrets;
}

/**
 * Inspect raw/normalized user text (including inside quoted strings or code blocks)
 * for prompt-injection, secret extraction, bypass, or unauthorized data disclosure attempts.
 */
function detectSecurityThreat(text) {
  if (!text || typeof text !== 'string') {
    return { blocked: false, category: null, response: null };
  }

  const normalized = text.replace(/\s+/g, ' ').trim();
  if (!normalized) {
    return { blocked: false, category: null, response: null };
  }

  if (SECRET_OR_PROMPT_EXTRACTION_PATTERNS.some((re) => re.test(normalized))) {
    return {
      blocked: true,
      category: 'secret_extraction',
      response: SAFE_SECURITY_RESPONSES.secret_extraction,
    };
  }

  if (DATA_EXFILTRATION_PATTERNS.some((re) => re.test(normalized))) {
    return {
      blocked: true,
      category: 'data_exfiltration',
      response: SAFE_SECURITY_RESPONSES.data_exfiltration,
    };
  }

  if (FAKE_ADMIN_OR_BYPASS_PATTERNS.some((re) => re.test(normalized))) {
    return {
      blocked: true,
      category: 'bypass_attempt',
      response: SAFE_SECURITY_RESPONSES.bypass_attempt,
    };
  }

  if (PROMPT_INJECTION_PATTERNS.some((re) => re.test(normalized))) {
    return {
      blocked: true,
      category: 'prompt_injection',
      response: SAFE_SECURITY_RESPONSES.prompt_injection,
    };
  }

  return { blocked: false, category: null, response: null };
}

/**
 * Output DLP filter ensuring neither Gemini nor fallback responses ever echo
 * internal secrets, env keys, connection strings, or prompt markers.
 */
function sanitizeAssistantOutput(text) {
  if (!text || typeof text !== 'string') return '';

  for (const secret of getRuntimeSecretLiterals()) {
    if (text.includes(secret)) {
      return "I'm here to help with Dasceq enquiries and appointment scheduling. How can I assist you today?";
    }
  }

  if (OUTPUT_LEAK_PATTERNS.some((re) => re.test(text))) {
    return "I'm here to help with Dasceq enquiries and appointment scheduling. How can I assist you today?";
  }

  return text;
}

/**
 * Inspect objects recursively for dangerous Mongo/prototype keys (`$...`, `__proto__`, `constructor`, `prototype`).
 */
function containsUnsafeKeys(value, depth = 0) {
  if (depth > 4 || value === null || typeof value !== 'object') return false;
  if (Array.isArray(value)) {
    return value.some((item) => containsUnsafeKeys(item, depth + 1));
  }
  for (const key of Object.keys(value)) {
    if (key.startsWith('$') || key === '__proto__' || key === 'constructor' || key === 'prototype') {
      return true;
    }
    if (containsUnsafeKeys(value[key], depth + 1)) {
      return true;
    }
  }
  return false;
}

/**
 * Redact configured secrets, tokens, DB URIs, emails, and phone numbers before writing server logs.
 */
function redactForLog(text) {
  if (!text || typeof text !== 'string') return '';
  let out = text;

  for (const secret of getRuntimeSecretLiterals()) {
    if (out.includes(secret)) {
      out = out.split(secret).join('[REDACTED_SECRET]');
    }
  }

  return out
    .replace(/AIza[0-9A-Za-z_-]{8,}/g, '[REDACTED_API_KEY]')
    .replace(/AQ\.[0-9A-Za-z._-]{10,}/g, '[REDACTED_API_KEY]')
    .replace(/(mongodb(?:\+srv)?:\/\/)[^\s]+/gi, '$1[REDACTED_URI]')
    .replace(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g, '[REDACTED_EMAIL]')
    .replace(/(?:\+?91[\s\-]?)?\b[6-9]\d{9}\b/g, '[REDACTED_PHONE]');
}

module.exports = {
  detectSecurityThreat,
  sanitizeAssistantOutput,
  containsUnsafeKeys,
  redactForLog,
};
