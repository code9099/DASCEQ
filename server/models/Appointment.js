/**
 * Appointment persistence repository supporting MongoDB and atomic local JSON storage.
 * Provides slot lookup, booking reference queries (`DSQ-XXXXXX`), and duplicate detection
 * by conversation ID or customer phone/email per date.
 */
const mongoose = require('mongoose');
const { generateId, generateBookingRef } = require('../utils/helpers');
const { isMongoReady, readLocalStoreSync, mutateLocalStore } = require('../services/dbService');

const AppointmentSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, unique: true, index: true },
    bookingRef: { type: String, required: true, unique: true, index: true },
    conversationId: { type: String, required: true, index: true },
    customerInfo: {
      name: { type: String, required: true },
      phone: { type: String, required: true },
      email: { type: String, required: true },
      enquiryPurpose: { type: String, default: '' },
      followUpNotes: { type: String, default: null },
    },
    date: { type: String, required: true, index: true },
    time: { type: String, required: true },
    status: { type: String, enum: ['confirmed', 'cancelled'], default: 'confirmed' },
    createdAt: { type: String, required: true },
  },
  { versionKey: false }
);

// Compound indexes for fast slot availability, duplicate checks & atomic confirmed-slot uniqueness
AppointmentSchema.index({ date: 1, status: 1 });
AppointmentSchema.index(
  { date: 1, time: 1 },
  { unique: true, partialFilterExpression: { status: 'confirmed' } }
);
AppointmentSchema.index({ conversationId: 1, status: 1 });
AppointmentSchema.index({ 'customerInfo.phone': 1, date: 1, status: 1 });
AppointmentSchema.index({ 'customerInfo.email': 1, date: 1, status: 1 });

const AppointmentDoc =
  mongoose.models.Appointment || mongoose.model('Appointment', AppointmentSchema);

function normalizeDoc(doc) {
  if (!doc) return null;
  const plain = typeof doc.toObject === 'function' ? doc.toObject() : { ...doc };
  delete plain._id;
  return plain;
}

async function createAppointment({ conversationId, customerInfo, date, time }) {
  const appointment = {
    id: generateId(),
    bookingRef: generateBookingRef(),
    conversationId,
    customerInfo: { ...customerInfo },
    date,
    time,
    status: 'confirmed',
    createdAt: new Date().toISOString(),
  };

  if (isMongoReady()) {
    // Ensure unique bookingRef
    while (await AppointmentDoc.exists({ bookingRef: appointment.bookingRef })) {
      appointment.bookingRef = generateBookingRef();
    }
    const created = await AppointmentDoc.create(appointment);
    return normalizeDoc(created);
  }

  return mutateLocalStore((store) => {
    const slotConflict = Object.values(store.appointments).find(
      (a) => a.date === date && a.time === time && a.status === 'confirmed'
    );
    if (slotConflict) {
      const err = new Error('Selected slot was just booked.');
      err.code = 'SLOT_CONFLICT';
      throw err;
    }
    const existingRefs = new Set(Object.values(store.appointments).map((a) => a.bookingRef));
    while (existingRefs.has(appointment.bookingRef)) {
      appointment.bookingRef = generateBookingRef();
    }
    store.appointments[appointment.id] = appointment;
    return structuredClone(appointment);
  });
}

async function getAppointmentById(id) {
  if (!id) return null;
  if (isMongoReady()) {
    const doc = await AppointmentDoc.findOne({ id }).lean();
    return normalizeDoc(doc);
  }
  const store = readLocalStoreSync();
  const found = store.appointments[id];
  return found ? structuredClone(found) : null;
}

async function getAppointmentByBookingRef(bookingRef) {
  if (!bookingRef) return null;
  const normalized = String(bookingRef).trim().toUpperCase();
  if (isMongoReady()) {
    const doc = await AppointmentDoc.findOne({ bookingRef: normalized }).lean();
    return normalizeDoc(doc);
  }
  const store = readLocalStoreSync();
  for (const appt of Object.values(store.appointments)) {
    if (String(appt.bookingRef).toUpperCase() === normalized) {
      return structuredClone(appt);
    }
  }
  return null;
}

async function getAppointmentByConversationId(conversationId) {
  if (!conversationId) return null;
  if (isMongoReady()) {
    const doc = await AppointmentDoc.findOne({
      conversationId,
      status: 'confirmed',
    }).lean();
    return normalizeDoc(doc);
  }
  const store = readLocalStoreSync();
  for (const appt of Object.values(store.appointments)) {
    if (appt.conversationId === conversationId && appt.status === 'confirmed') {
      return structuredClone(appt);
    }
  }
  return null;
}

async function getActiveDuplicateForCustomer({ phone, email, date }) {
  if (!date || (!phone && !email)) return null;
  const cleanEmail = email ? String(email).trim().toLowerCase() : null;
  const cleanPhone = phone ? String(phone).trim() : null;

  if (isMongoReady()) {
    const orConditions = [];
    if (cleanPhone) orConditions.push({ 'customerInfo.phone': cleanPhone });
    if (cleanEmail) orConditions.push({ 'customerInfo.email': cleanEmail });
    if (orConditions.length === 0) return null;
    const doc = await AppointmentDoc.findOne({
      date,
      status: 'confirmed',
      $or: orConditions,
    }).lean();
    return normalizeDoc(doc);
  }

  const store = readLocalStoreSync();
  for (const appt of Object.values(store.appointments)) {
    if (appt.status === 'confirmed' && appt.date === date) {
      if (
        (cleanPhone && appt.customerInfo?.phone === cleanPhone) ||
        (cleanEmail && String(appt.customerInfo?.email || '').toLowerCase() === cleanEmail)
      ) {
        return structuredClone(appt);
      }
    }
  }
  return null;
}

async function getAppointmentsByDate(date) {
  if (!date) return [];
  if (isMongoReady()) {
    const docs = await AppointmentDoc.find({
      date,
      status: { $ne: 'cancelled' },
    }).lean();
    return docs.map(normalizeDoc);
  }
  const store = readLocalStoreSync();
  return Object.values(store.appointments)
    .filter((appt) => appt.date === date && appt.status !== 'cancelled')
    .map((appt) => structuredClone(appt));
}

async function cancelAppointment(id) {
  if (!id) return null;
  if (isMongoReady()) {
    const doc = await AppointmentDoc.findOneAndUpdate(
      { id },
      { $set: { status: 'cancelled' } },
      { returnDocument: 'after' }
    ).lean();
    return normalizeDoc(doc);
  }
  return mutateLocalStore((store) => {
    const appt = store.appointments[id];
    if (!appt) return null;
    appt.status = 'cancelled';
    store.appointments[id] = appt;
    return structuredClone(appt);
  });
}

async function getAllAppointments() {
  if (isMongoReady()) {
    const docs = await AppointmentDoc.find({}).sort({ createdAt: -1 }).lean();
    return docs.map(normalizeDoc);
  }
  const store = readLocalStoreSync();
  return Object.values(store.appointments).map((appt) => structuredClone(appt));
}

module.exports = {
  createAppointment,
  getAppointmentById,
  getAppointmentByBookingRef,
  getAppointmentByConversationId,
  getActiveDuplicateForCustomer,
  getAppointmentsByDate,
  cancelAppointment,
  getAllAppointments,
};
