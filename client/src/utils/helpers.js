/**
 * Format a timestamp for display in chat messages.
 * @param {string|Date} timestamp
 * @returns {string}
 */
export function formatTime(timestamp) {
  if (!timestamp) return '';
  const date = timestamp instanceof Date ? timestamp : new Date(timestamp);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/**
 * Format a date string (YYYY-MM-DD) to a human-friendly format in Asia/Kolkata.
 * @param {string} dateStr
 * @returns {string}
 */
export function formatDate(dateStr) {
  if (!dateStr) return '';
  const match = String(dateStr).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return dateStr;
  const [, year, month, day] = match;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), 12, 0, 0));
  return date.toLocaleDateString('en-IN', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'Asia/Kolkata',
  });
}

/**
 * Format a 24-hour HH:MM string into 12-hour AM/PM display format.
 * @param {string} timeStr
 * @returns {string}
 */
export function formatSlotTime(timeStr) {
  if (!timeStr) return '';
  const match = String(timeStr).match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return timeStr;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  const period = hours >= 12 ? 'PM' : 'AM';
  const displayHours = hours % 12 || 12;
  return `${displayHours}:${String(minutes).padStart(2, '0')} ${period}`;
}

/**
 * Generate a unique message ID.
 * @returns {string}
 */
export function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 9);
}

/**
 * Convert `YYYY-MM-DD` and `HH:MM` (Asia/Kolkata, +05:30) to UTC compact ISO `YYYYMMDDTHHMMSSZ`.
 */
function toUtcCalendarStamp(dateStr, timeStr, addMinutes = 0) {
  if (!dateStr || !timeStr) return null;
  const parsedMs = Date.parse(`${dateStr}T${timeStr}:00+05:30`);
  if (Number.isNaN(parsedMs)) return null;
  const d = new Date(parsedMs + addMinutes * 60_000);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(
    d.getUTCHours()
  )}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
}

/**
 * Build a Google Calendar "Add Event" link pre-filled with the confirmed consultation details.
 */
export function buildGoogleCalendarUrl(booking) {
  if (!booking?.date || !booking?.time) return null;
  const startUtc = toUtcCalendarStamp(booking.date, booking.time, 0);
  const endUtc = toUtcCalendarStamp(booking.date, booking.time, 30);
  if (!startUtc || !endUtc) return null;

  const purpose = booking.customerInfo?.enquiryPurpose || 'Customer Consultation';
  const title = `Dasceq Consultation: ${purpose}`;
  const details = [
    booking.bookingRef ? `Booking Reference: ${booking.bookingRef}` : null,
    booking.customerInfo?.name ? `Customer: ${booking.customerInfo.name}` : null,
    booking.customerInfo?.phone ? `Phone: ${booking.customerInfo.phone}` : null,
    booking.customerInfo?.email ? `Email: ${booking.customerInfo.email}` : null,
    `Purpose: ${purpose}`,
    `Scheduled via Dasceq AI Receptionist (IST 30-min slot)`,
  ]
    .filter(Boolean)
    .join('\n');

  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: title,
    dates: `${startUtc}/${endUtc}`,
    details,
    ctz: 'Asia/Kolkata',
  });

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

/**
 * Generate RFC-5545 `.ics` calendar invite text for Outlook / Apple Calendar / Google Calendar.
 */
export function buildIcsContent(booking) {
  if (!booking?.date || !booking?.time) return null;
  const startUtc = toUtcCalendarStamp(booking.date, booking.time, 0);
  const endUtc = toUtcCalendarStamp(booking.date, booking.time, 30);
  if (!startUtc || !endUtc) return null;

  const escapeIcs = (val) =>
    String(val || '')
      .replace(/\\/g, '\\\\')
      .replace(/\n/g, '\\n')
      .replace(/,/g, '\\,')
      .replace(/;/g, '\\;');

  const ref = booking.bookingRef || 'DSQ-APPT';
  const purpose = booking.customerInfo?.enquiryPurpose || 'Customer Consultation';
  const description = [
    `Booking Reference: ${ref}`,
    booking.customerInfo?.name ? `Customer: ${booking.customerInfo.name}` : null,
    booking.customerInfo?.phone ? `Phone: ${booking.customerInfo.phone}` : null,
    booking.customerInfo?.email ? `Email: ${booking.customerInfo.email}` : null,
    `Purpose: ${purpose}`,
  ]
    .filter(Boolean)
    .join('\n');

  const nowStamp = `${new Date().toISOString().replace(/[-:]/g, '').split('.')[0]}Z`;

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Dasceq//AI Receptionist//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${escapeIcs(ref)}@dasceq.ai`,
    `DTSTAMP:${nowStamp}`,
    `DTSTART:${startUtc}`,
    `DTEND:${endUtc}`,
    `SUMMARY:${escapeIcs(`Dasceq Consultation (${ref})`)}`,
    `DESCRIPTION:${escapeIcs(description)}`,
    'STATUS:CONFIRMED',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
}

/**
 * Trigger a browser download of an `.ics` calendar invite for a confirmed booking.
 */
export function downloadBookingIcs(booking) {
  const ics = buildIcsContent(booking);
  if (!ics || typeof document === 'undefined') return false;
  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${booking.bookingRef || 'dasceq-appointment'}.ics`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return true;
}
