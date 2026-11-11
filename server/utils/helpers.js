/**
 * Asia/Kolkata (`IST`) date/time helpers, calendar validation, natural-language date/time parsers,
 * and unique `DSQ-XXXXXX` booking reference generation.
 */
const { v4: uuidv4 } = require('uuid');

/**
 * Generate a booking reference in format DSQ-XXXXXX
 */
function generateBookingRef() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `DSQ-${code}`;
}

/**
 * Get current date and time components in IST (Asia/Kolkata), independent of server OS timezone.
 * Uses `Intl.DateTimeFormat` parts rather than local `Date` constructors to avoid host TZ drift.
 */
function getNowISTParts() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    weekday: 'short',
  }).formatToParts(new Date());

  const map = {};
  for (const part of parts) {
    if (part.type !== 'literal') {
      map[part.type] = part.value;
    }
  }

  const year = parseInt(map.year, 10);
  const month = parseInt(map.month, 10);
  const day = parseInt(map.day, 10);
  let hours = parseInt(map.hour, 10);
  if (hours === 24) hours = 0;
  const minutes = parseInt(map.minute, 10);
  const dateStr = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  const weekdayMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

  return {
    year,
    month,
    day,
    hours,
    minutes,
    dateStr,
    weekdayIndex: weekdayMap[map.weekday],
  };
}

/**
 * Get today's date in YYYY-MM-DD (Asia/Kolkata).
 */
function getTodayIST() {
  return getNowISTParts().dateStr;
}

/**
 * Format a date string (YYYY-MM-DD) for display in Asia/Kolkata.
 */
function formatDate(dateStr) {
  const parsed = parseDate(dateStr);
  if (!parsed) return dateStr || '';
  const date = new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day, 12, 0, 0));
  return date.toLocaleDateString('en-IN', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'Asia/Kolkata',
  });
}

/**
 * Format a time string (HH:MM) for display.
 */
function formatTime(timeStr) {
  if (!timeStr || typeof timeStr !== 'string') return '';
  const match = timeStr.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return timeStr;
  const hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  const period = hours >= 12 ? 'PM' : 'AM';
  const displayHours = hours % 12 || 12;
  return `${displayHours}:${String(minutes).padStart(2, '0')} ${period}`;
}

/**
 * Parse a YYYY-MM-DD date string and validate calendar accuracy.
 */
function parseDate(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') return null;

  const match = dateStr.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;

  const year = parseInt(match[1], 10);
  const month = parseInt(match[2], 10);
  const day = parseInt(match[3], 10);

  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  const utcDate = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  if (
    utcDate.getUTCFullYear() !== year ||
    utcDate.getUTCMonth() !== month - 1 ||
    utcDate.getUTCDate() !== day
  ) {
    return null;
  }

  return { year, month, day, date: utcDate, dateStr: match[0] };
}

/**
 * Add days to a YYYY-MM-DD string safely.
 */
function addDaysToDateStr(dateStr, days) {
  const parsed = parseDate(dateStr);
  if (!parsed) return null;
  const utc = new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day + days, 12, 0, 0));
  return `${utc.getUTCFullYear()}-${String(utc.getUTCMonth() + 1).padStart(2, '0')}-${String(
    utc.getUTCDate()
  ).padStart(2, '0')}`;
}

/**
 * Check if a date string is today or in the future (Asia/Kolkata).
 */
function isDateNotPast(dateStr) {
  const parsed = parseDate(dateStr);
  if (!parsed) return false;
  const todayStr = getTodayIST();
  return parsed.dateStr >= todayStr;
}

/**
 * Check if a date string is a weekend (Saturday or Sunday).
 */
function isWeekend(dateStr) {
  const parsed = parseDate(dateStr);
  if (!parsed) return false;
  const day = parsed.date.getUTCDay();
  return day === 0 || day === 6;
}

/**
 * Parse natural language date expressions in Asia/Kolkata.
 * Returns { dateStr } or { invalid: true, error } or null.
 */
function parseNaturalDate(text) {
  if (!text || typeof text !== 'string') return null;
  const nowParts = getNowISTParts();
  const todayStr = nowParts.dateStr;

  // 1. ISO YYYY-MM-DD
  const isoMatch = text.match(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/);
  if (isoMatch) {
    const candidate = `${isoMatch[1]}-${String(isoMatch[2]).padStart(2, '0')}-${String(
      isoMatch[3]
    ).padStart(2, '0')}`;
    if (!parseDate(candidate)) {
      return { invalid: true, error: `"${isoMatch[0]}" is not a valid calendar date.` };
    }
    return { dateStr: candidate };
  }

  // 2. DD/MM/YYYY or DD-MM-YYYY
  const dmyMatch = text.match(/\b(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})\b/);
  if (dmyMatch) {
    const candidate = `${dmyMatch[3]}-${String(dmyMatch[2]).padStart(2, '0')}-${String(
      dmyMatch[1]
    ).padStart(2, '0')}`;
    if (!parseDate(candidate)) {
      return { invalid: true, error: `"${dmyMatch[0]}" is not a valid calendar date.` };
    }
    return { dateStr: candidate };
  }

  // 3. Relative day keywords
  if (/\bday after tomorrow\b/i.test(text)) {
    return { dateStr: addDaysToDateStr(todayStr, 2) };
  }
  if (/\btomorrow\b/i.test(text)) {
    return { dateStr: addDaysToDateStr(todayStr, 1) };
  }
  if (/\byesterday\b/i.test(text)) {
    return { dateStr: addDaysToDateStr(todayStr, -1) };
  }
  if (/\btoday\b/i.test(text)) {
    return { dateStr: todayStr };
  }

  // 4. Weekday names (e.g., "next Monday", "this Friday", "Monday")
  const weekdayRegex =
    /\b(?:(this|next|coming)\s+)?(monday|mon|tuesday|tue|tues|wednesday|wed|thursday|thu|thur|thurs|friday|fri|saturday|sat|sunday|sun)\b/i;
  const wdMatch = text.match(weekdayRegex);
  if (wdMatch) {
    const modifier = (wdMatch[1] || '').toLowerCase();
    const token = wdMatch[2].toLowerCase();
    const dayIndexMap = {
      sun: 0, sunday: 0,
      mon: 1, monday: 1,
      tue: 2, tues: 2, tuesday: 2,
      wed: 3, wednesday: 3,
      thu: 4, thur: 4, thurs: 4, thursday: 4,
      fri: 5, friday: 5,
      sat: 6, saturday: 6,
    };
    const targetDay = dayIndexMap[token];
    let diff = (targetDay - nowParts.weekdayIndex + 7) % 7;
    if (modifier === 'next') {
      diff = diff === 0 ? 7 : diff;
    } else if (modifier === 'this') {
      // Keep diff (0 if today is that day)
    } else if (diff === 0) {
      // Plain weekday matching today: choose next week (or today if early? standard is upcoming occurrence)
      diff = 7;
    }
    return { dateStr: addDaysToDateStr(todayStr, diff) };
  }

  // 5. Month name formats: "16 Nov", "16th November 2026", "Nov 16", "November 16, 2026"
  const monthMap = {
    jan: 1, january: 1,
    feb: 2, february: 2,
    mar: 3, march: 3,
    apr: 4, april: 4,
    may: 5,
    jun: 6, june: 6,
    jul: 7, july: 7,
    aug: 8, august: 8,
    sep: 9, sept: 9, september: 9,
    oct: 10, october: 10,
    nov: 11, november: 11,
    dec: 12, december: 12,
  };
  const monthsPattern = Object.keys(monthMap).join('|');
  const dayFirstRe = new RegExp(
    `\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(${monthsPattern})(?:,?\\s+(\\d{4}))?\\b`,
    'i'
  );
  const monthFirstRe = new RegExp(
    `\\b(${monthsPattern})\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(\\d{4}))?\\b`,
    'i'
  );

  let dayNum = null;
  let monthNum = null;
  let yearNum = null;
  let rawStr = '';

  const m1 = text.match(dayFirstRe);
  const m2 = text.match(monthFirstRe);
  if (m1) {
    dayNum = parseInt(m1[1], 10);
    monthNum = monthMap[m1[2].toLowerCase()];
    yearNum = m1[3] ? parseInt(m1[3], 10) : nowParts.year;
    rawStr = m1[0];
  } else if (m2) {
    monthNum = monthMap[m2[1].toLowerCase()];
    dayNum = parseInt(m2[2], 10);
    yearNum = m2[3] ? parseInt(m2[3], 10) : nowParts.year;
    rawStr = m2[0];
  }

  if (dayNum !== null && monthNum !== null) {
    const candidate = `${String(yearNum).padStart(4, '0')}-${String(monthNum).padStart(
      2,
      '0'
    )}-${String(dayNum).padStart(2, '0')}`;
    if (!parseDate(candidate)) {
      return { invalid: true, error: `"${rawStr}" is not a valid calendar date.` };
    }
    return { dateStr: candidate };
  }

  return null;
}

/**
 * Parse natural time expressions such as "2 PM", "2:00 p.m.", "4:30 PM", "14:00", "2 o'clock", "10:30".
 * Returns { time: "HH:MM" } or { invalid: true, error } or null.
 */
function parseNaturalTime(text, { allowBareHour = false } = {}) {
  if (!text || typeof text !== 'string') return null;

  // Strip ISO / slash dates and phone numbers so digits inside them aren't mistaken for times
  // Normalize spaced/dotted meridiem markers (e.g. "2:00 p.m." -> "2:00 pm") from Web Speech STT
  const cleaned = text
    .replace(/\b\d{4}-\d{1,2}-\d{1,2}\b/g, ' ')
    .replace(/\b\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4}\b/g, ' ')
    .replace(/(?:\+?91[\s\-]?)?\b[6-9]\d{9}\b/g, ' ')
    .replace(/(?<![a-z])a\s*\.\s*m\.?(?![a-z])/gi, 'am')
    .replace(/(?<![a-z])p\s*\.\s*m\.?(?![a-z])/gi, 'pm');

  if (/\b(?:12\s+)?noon\b/i.test(cleaned)) {
    return { time: '12:00' };
  }

  // Spoken part-of-day phrases: "2 in the afternoon", "10:30 in the morning", "5 in the evening"
  const partOfDayMatch = cleaned.match(
    /\b(\d{1,2})(?::(\d{2}))?\s+in\s+the\s+(morning|afternoon|evening)\b/i
  );
  if (partOfDayMatch) {
    let hours = parseInt(partOfDayMatch[1], 10);
    const mins = partOfDayMatch[2] ? parseInt(partOfDayMatch[2], 10) : 0;
    const tod = partOfDayMatch[3].toLowerCase();
    if (hours < 1 || hours > 12 || mins < 0 || mins > 59) {
      return { invalid: true, error: `"${partOfDayMatch[0]}" is not a valid 12-hour time.` };
    }
    if (tod === 'morning') {
      if (hours === 12) hours = 0;
    } else if (hours < 12) {
      hours += 12;
    }
    return { time: `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}` };
  }

  // Spoken o'clock: "2 o'clock", "4 o clock", "11 o'clock"
  const oClockMatch = cleaned.match(/\b(\d{1,2})\s*o['’]?\s*clock\b/i);
  if (oClockMatch) {
    let hours = parseInt(oClockMatch[1], 10);
    if (hours < 1 || hours > 12) {
      return { invalid: true, error: `"${oClockMatch[0]}" is not a valid hour.` };
    }
    if (hours >= 1 && hours <= 5) {
      hours += 12;
    }
    return { time: `${String(hours).padStart(2, '0')}:00` };
  }

  // 1. HH:MM with optional am/pm
  const colonMatch = cleaned.match(/\b(\d{1,2}):(\d{2})\s*(am|pm)?\b/i);
  if (colonMatch) {
    let hours = parseInt(colonMatch[1], 10);
    const mins = parseInt(colonMatch[2], 10);
    const period = colonMatch[3]?.toLowerCase();

    if (mins < 0 || mins > 59 || hours < 0 || hours > 23) {
      return { invalid: true, error: `"${colonMatch[0]}" is not a valid time.` };
    }
    if (period) {
      if (hours < 1 || hours > 12) {
        return { invalid: true, error: `"${colonMatch[0]}" is not a valid 12-hour time.` };
      }
      if (period === 'pm' && hours < 12) hours += 12;
      if (period === 'am' && hours === 12) hours = 0;
    }

    return { time: `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}` };
  }

  // 2. Spoken "2 30 pm" / "10 30 am" (only when meridiem is explicit)
  const spacedAmPmMatch = cleaned.match(/\b(\d{1,2})\s+(\d{2})\s*(am|pm)\b/i);
  if (spacedAmPmMatch) {
    let hours = parseInt(spacedAmPmMatch[1], 10);
    const mins = parseInt(spacedAmPmMatch[2], 10);
    const period = spacedAmPmMatch[3].toLowerCase();
    if (hours < 1 || hours > 12 || mins < 0 || mins > 59) {
      return { invalid: true, error: `"${spacedAmPmMatch[0]}" is not a valid 12-hour time.` };
    }
    if (period === 'pm' && hours < 12) hours += 12;
    if (period === 'am' && hours === 12) hours = 0;
    return { time: `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}` };
  }

  // 3. Hour with am/pm (e.g., "2 PM", "10 am", "4pm")
  const amPmMatch = cleaned.match(/\b(\d{1,2})\s*(am|pm)\b/i);
  if (amPmMatch) {
    let hours = parseInt(amPmMatch[1], 10);
    const period = amPmMatch[2].toLowerCase();
    if (hours < 1 || hours > 12) {
      return { invalid: true, error: `"${amPmMatch[0]}" is not a valid 12-hour time.` };
    }
    if (period === 'pm' && hours < 12) hours += 12;
    if (period === 'am' && hours === 12) hours = 0;
    return { time: `${String(hours).padStart(2, '0')}:00` };
  }

  // 4. Bare hour only when explicitly answering a time prompt (e.g., "at 2", "make it 3", "14")
  if (allowBareHour) {
    const bareMatch = cleaned.match(
      /(?:^|\b(?:at|make\s+it|around|about|for|try)\s+)(\d{1,2})(?=\s|$|[.,!?])/i
    );
    if (bareMatch) {
      let hours = parseInt(bareMatch[1], 10);
      if (hours >= 1 && hours <= 5) {
        // Ambiguous small hour during business hours -> 13:00..17:00
        hours += 12;
      }
      if (hours < 0 || hours > 23) {
        return { invalid: true, error: `"${bareMatch[1]}" is not a valid hour.` };
      }
      return { time: `${String(hours).padStart(2, '0')}:00` };
    }
  }

  return null;
}

/**
 * Generate a UUID
 */
function generateId() {
  return uuidv4();
}

module.exports = {
  generateBookingRef,
  getNowISTParts,
  getTodayIST,
  formatDate,
  formatTime,
  parseDate,
  addDaysToDateStr,
  isDateNotPast,
  isWeekend,
  parseNaturalDate,
  parseNaturalTime,
  generateId,
};
