/**
 * Business-hours slot availability generator for Asia/Kolkata (`IST`).
 * Operates Monday–Friday, 9:00 AM to 6:00 PM IST (30-minute intervals `09:00`–`17:30`),
 * filtering out already booked appointments and elapsed times on today's date.
 */
const { getNowISTParts, formatTime } = require('../utils/helpers');
const AppointmentModel = require('../models/Appointment');

/**
 * Generate 30-minute time slots from 9:00 AM to 5:30 PM IST (9 AM – 6 PM window).
 */
async function generateSlots(date) {
  const slots = [];
  for (let hour = 9; hour < 18; hour++) {
    for (let min = 0; min < 60; min += 30) {
      const time = `${String(hour).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
      slots.push({
        time,
        displayTime: formatTime(time),
        available: true,
      });
    }
  }

  // Mark already booked slots as unavailable
  const bookedAppointments = await AppointmentModel.getAppointmentsByDate(date);
  for (const appt of bookedAppointments) {
    const slot = slots.find((s) => s.time === appt.time);
    if (slot) {
      slot.available = false;
    }
  }

  // If date is today in IST, mark elapsed/past slots unavailable
  const nowParts = getNowISTParts();
  if (date === nowParts.dateStr) {
    for (const slot of slots) {
      const [h, m] = slot.time.split(':').map(Number);
      if (h < nowParts.hours || (h === nowParts.hours && m <= nowParts.minutes)) {
        slot.available = false;
      }
    }
  }

  return slots;
}

/**
 * Check if a specific slot is valid and available.
 */
async function isSlotAvailable(date, time) {
  const slots = await generateSlots(date);
  const slot = slots.find((s) => s.time === time);
  return slot ? slot.available : false;
}

/**
 * Check if a HH:MM time corresponds to one of the valid 30-min slots (09:00..17:30).
 */
function isValidSlotTime(time) {
  if (!time || !/^\d{2}:\d{2}$/.test(time)) return false;
  const [h, m] = time.split(':').map(Number);
  if (h < 9 || h >= 18) return false;
  return m === 0 || m === 30;
}

/**
 * Get available slots only.
 */
async function getAvailableSlots(date) {
  const all = await generateSlots(date);
  return all.filter((s) => s.available);
}

module.exports = {
  generateSlots,
  isSlotAvailable,
  isValidSlotTime,
  getAvailableSlots,
};
