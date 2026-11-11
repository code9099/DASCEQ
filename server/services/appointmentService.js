/**
 * Appointment business-logic service enforcing IST date/weekday rules, 30-min slot availability,
 * and duplicate-booking prevention across slot, conversation, and customer contact (`phone`/`email`).
 */
const AppointmentModel = require('../models/Appointment');
const availabilityService = require('./availabilityService');
const { isDateNotPast, isWeekend, parseDate, formatDate, formatTime } = require('../utils/helpers');

/**
 * Get available time slots for a date (Asia/Kolkata).
 */
async function getAvailability(date) {
  const parsed = parseDate(date);
  if (!parsed) {
    return { success: false, error: 'Invalid date format. Please use YYYY-MM-DD.' };
  }

  if (!isDateNotPast(date)) {
    return {
      success: false,
      error: `${formatDate(date)} is in the past. Please choose today or a future weekday.`,
    };
  }

  if (isWeekend(date)) {
    return {
      success: true,
      data: {
        date,
        displayDate: formatDate(date),
        isWeekend: true,
        slots: [],
        totalAvailable: 0,
        message: `${formatDate(date)} falls on a weekend. We operate Monday to Friday, 9:00 AM to 6:00 PM IST. Please select a weekday.`,
      },
    };
  }

  const slots = await availabilityService.getAvailableSlots(date);
  return {
    success: true,
    data: {
      date,
      displayDate: formatDate(date),
      isWeekend: false,
      slots,
      totalAvailable: slots.length,
    },
  };
}

/**
 * Create an appointment after enforcing date, business-hour, availability, and duplicate checks.
 */
async function createAppointment({ conversationId, customerInfo, date, time }) {
  const parsed = parseDate(date);
  if (!parsed) {
    return { success: false, error: 'Invalid date format. Please use YYYY-MM-DD.' };
  }

  if (!isDateNotPast(date)) {
    return { success: false, error: 'Cannot book appointments in the past. Please choose today or a future weekday.' };
  }

  if (isWeekend(date)) {
    return {
      success: false,
      error: 'We are closed on weekends (Saturday and Sunday). Please select a weekday.',
    };
  }

  if (!time || !/^\d{2}:\d{2}$/.test(time)) {
    return { success: false, error: 'Invalid time format. Please provide a valid time like 10:00 AM or 2:30 PM.' };
  }

  if (!availabilityService.isValidSlotTime(time)) {
    return {
      success: false,
      error: `${formatTime(time)} is outside our booking slots. Appointments are available Monday–Friday from 9:00 AM to 5:30 PM IST in 30-minute intervals.`,
    };
  }

  const available = await availabilityService.isSlotAvailable(date, time);
  if (!available) {
    return {
      success: false,
      error: `The slot at ${formatTime(time)} on ${formatDate(date)} is not available (already booked or in the past).`,
    };
  }

  // Prevent duplicate booking for the same conversation
  const existingConvAppt = await AppointmentModel.getAppointmentByConversationId(conversationId);
  if (existingConvAppt && existingConvAppt.status === 'confirmed') {
    return {
      success: false,
      error: `You already have a confirmed booking (${existingConvAppt.bookingRef}) on ${formatDate(
        existingConvAppt.date
      )} at ${formatTime(existingConvAppt.time)}.`,
    };
  }

  // Prevent duplicate booking for the same customer (phone/email) on the same date
  const existingCustomerAppt = await AppointmentModel.getActiveDuplicateForCustomer({
    phone: customerInfo?.phone,
    email: customerInfo?.email,
    date,
  });
  if (existingCustomerAppt) {
    return {
      success: false,
      error: `An appointment (${existingCustomerAppt.bookingRef}) already exists for your contact details on ${formatDate(
        existingCustomerAppt.date
      )} at ${formatTime(existingCustomerAppt.time)}.`,
    };
  }

  try {
    const appointment = await AppointmentModel.createAppointment({
      conversationId,
      customerInfo,
      date,
      time,
    });

    return {
      success: true,
      data: {
        ...appointment,
        displayDate: formatDate(date),
        displayTime: formatTime(time),
      },
    };
  } catch (err) {
    if (err?.code === 11000 || err?.code === 'SLOT_CONFLICT') {
      return {
        success: false,
        error: `The slot at ${formatTime(time)} on ${formatDate(date)} was just booked by someone else. Please select another time.`,
      };
    }
    throw err;
  }
}

/**
 * Get appointment by ID or booking ref.
 */
async function getAppointment(identifier) {
  let appointment = await AppointmentModel.getAppointmentById(identifier);
  if (!appointment) {
    appointment = await AppointmentModel.getAppointmentByBookingRef(identifier);
  }
  if (!appointment) {
    return { success: false, error: 'Appointment not found.' };
  }
  return {
    success: true,
    data: {
      ...appointment,
      displayDate: formatDate(appointment.date),
      displayTime: formatTime(appointment.time),
    },
  };
}

/**
 * Cancel an appointment.
 */
async function cancelAppointment(identifier) {
  let appointment = await AppointmentModel.getAppointmentById(identifier);
  if (!appointment) {
    appointment = await AppointmentModel.getAppointmentByBookingRef(identifier);
  }
  if (!appointment) {
    return { success: false, error: 'Appointment not found.' };
  }

  if (appointment.status === 'cancelled') {
    return { success: false, error: 'This appointment is already cancelled.' };
  }

  const cancelled = await AppointmentModel.cancelAppointment(appointment.id);
  return {
    success: true,
    data: cancelled,
  };
}

module.exports = {
  getAvailability,
  createAppointment,
  getAppointment,
  cancelAppointment,
};
