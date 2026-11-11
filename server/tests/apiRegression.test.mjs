/**
 * Portable end-to-end backend API & persistence regression suite.
 * Covers conversation initialization, detail extraction/validation, follow-up topic
 * disambiguation (including "Schedule an appointment" + person name preservation),
 * IST availability, duplicate/past/weekend/slot protection, explicit confirmation gate,
 * and restart persistence.
 *
 * Usage:
 *   npm test                         # Runs core suite (local-json store)
 *   RUN_MONGO_TEST=1 npm test        # Also verifies real MongoDB persistence
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const serverDir = path.resolve(__dirname, '..');
const storePath = path.join(serverDir, 'data', 'store.json');
const PORT = process.env.TEST_PORT || '5058';
const BASE = `http://127.0.0.1:${PORT}/api`;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function api(method, endpoint, body = null) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };
  if (body !== null) opts.body = JSON.stringify(body);
  const res = await fetch(`${BASE}${endpoint}`, opts);
  const json = await res.json();
  return { status: res.status, json };
}

function startBackend(extraEnv = {}) {
  const logs = [];
  const proc = spawn('node', ['index.js'], {
    cwd: serverDir,
    env: { ...process.env, PORT, ...extraEnv },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  proc.stdout.on('data', (d) => logs.push(d.toString()));
  proc.stderr.on('data', (d) => logs.push(d.toString()));
  return { proc, logs };
}

async function waitForHealth(logs) {
  for (let i = 0; i < 40; i++) {
    try {
      const r = await api('GET', '/health');
      if (r.status === 200) return r.json.data;
    } catch {
      await sleep(200);
    }
  }
  throw new Error(`Server failed to become healthy.\nLogs:\n${logs.join('')}`);
}

async function runSuite(label, envOverrides) {
  console.log(`\n=== ${label} ===`);
  let { proc, logs } = startBackend(envOverrides);

  try {
    const health = await waitForHealth(logs);
    assert.equal(health.status, 'healthy');

    // 0. Root status endpoint
    const rootRes = await fetch(`http://127.0.0.1:${PORT}/`);
    assert.equal(rootRes.status, 200);
    const rootJson = await rootRes.json();
    assert.deepEqual(rootJson, {
      success: true,
      message: 'Dasceq API is running',
      status: 'healthy',
    });

    // 1. Welcome message & start
    const startRes = await api('POST', '/chat/start');
    assert.equal(startRes.status, 201);
    const convId = startRes.json.data.conversationId;
    assert.ok(convId);
    assert.match(startRes.json.data.message, /Welcome to Dasceq/i);

    // 2. Greeting should never be recorded as enquiryPurpose
    const greetRes = await api('POST', '/chat/message', { conversationId: convId, message: 'hello' });
    assert.equal(greetRes.json.data.customerInfo.enquiryPurpose, null);

    // 3. Purpose + context-aware follow-up
    const purposeRes = await api('POST', '/chat/message', {
      conversationId: convId,
      message: 'Product enquiry',
    });
    assert.equal(purposeRes.json.data.customerInfo.enquiryPurpose, 'Product enquiry');

    // 4. Follow-up enrichment -> prompts for full name
    const followUpRes = await api('POST', '/chat/message', {
      conversationId: convId,
      message: 'Looking for an AI chatbot for enterprise support',
    });
    assert.match(followUpRes.json.data.customerInfo.enquiryPurpose, /AI chatbot/i);

    // 5. Validation errors for invalid name / phone / email
    const badNameRes = await api('POST', '/chat/message', { conversationId: convId, message: 'Tomorrow' });
    assert.equal(badNameRes.json.data.customerInfo.name, null);
    assert.match(badNameRes.json.data.message, /doesn't look like a person's name/i);

    const nameRes = await api('POST', '/chat/message', { conversationId: convId, message: 'rahul sharma' });
    assert.equal(nameRes.json.data.customerInfo.name, 'Rahul Sharma');

    const badPhoneRes = await api('POST', '/chat/message', { conversationId: convId, message: '12345' });
    assert.equal(badPhoneRes.json.data.customerInfo.phone, null);
    assert.match(badPhoneRes.json.data.message, /10 digits/i);

    const phoneRes = await api('POST', '/chat/message', { conversationId: convId, message: '+91 9876543210' });
    assert.equal(phoneRes.json.data.customerInfo.phone, '9876543210');

    const badEmailRes = await api('POST', '/chat/message', { conversationId: convId, message: 'rahul@invalid' });
    assert.equal(badEmailRes.json.data.customerInfo.email, null);
    assert.match(badEmailRes.json.data.message, /valid email/i);

    const emailRes = await api('POST', '/chat/message', { conversationId: convId, message: 'rahul@example.com' });
    assert.equal(emailRes.json.data.customerInfo.email, 'rahul@example.com');
    assert.equal(emailRes.json.data.stage, 'COLLECT_APPOINTMENT_PREFERENCES');

    // 6. Date/time validation & real availability
    const pastDateRes = await api('POST', '/chat/message', { conversationId: convId, message: '2020-01-01' });
    assert.match(pastDateRes.json.data.message, /in the past/i);

    const weekendRes = await api('POST', '/chat/message', { conversationId: convId, message: 'Saturday' });
    assert.match(weekendRes.json.data.message, /weekend/i);

    const validDateRes = await api('POST', '/chat/message', { conversationId: convId, message: 'next Monday' });
    assert.equal(validDateRes.json.data.stage, 'CHECK_AVAILABILITY');
    const bookedDate = validDateRes.json.data.appointmentDetails.date;
    assert.ok(validDateRes.json.data.availableSlots?.length > 0);

    const badTimeRes = await api('POST', '/chat/message', { conversationId: convId, message: '8:00 PM' });
    assert.match(badTimeRes.json.data.message, /not a valid booking slot/i);

    // 7. Confirmation gate: No must abort booking; Yes creates DSQ-XXXXXX
    const pickTimeRes = await api('POST', '/chat/message', { conversationId: convId, message: '2:00 p.m.' });
    assert.equal(pickTimeRes.json.data.stage, 'AWAIT_CUSTOMER_CONFIRMATION');
    assert.equal(pickTimeRes.json.data.appointmentDetails.time, '14:00');
    assert.equal(pickTimeRes.json.data.bookingRef, null);

    // Asking to "change my time" preserves selected date and shows available slots immediately
    const changeTimeOnly = await api('POST', '/chat/message', { conversationId: convId, message: 'change my time' });
    assert.equal(changeTimeOnly.json.data.stage, 'CHECK_AVAILABILITY');
    assert.equal(changeTimeOnly.json.data.appointmentDetails.date, bookedDate);
    assert.ok(changeTimeOnly.json.data.availableSlots?.length > 0);

    // Rejecting via No returns to date preference selection
    await api('POST', '/chat/message', { conversationId: convId, message: '4 o\'clock' });
    const noRes = await api('POST', '/chat/message', { conversationId: convId, message: 'No' });
    assert.equal(noRes.json.data.bookingRef, null);
    assert.equal(noRes.json.data.stage, 'COLLECT_APPOINTMENT_PREFERENCES');

    await api('POST', '/chat/message', { conversationId: convId, message: bookedDate });
    await api('POST', '/chat/message', { conversationId: convId, message: '4:30 PM' });
    const yesRes = await api('POST', '/chat/message', { conversationId: convId, message: 'Yes' });
    assert.equal(yesRes.json.data.stage, 'BOOKING_CONFIRMED');
    const bookedRef = yesRes.json.data.bookingRef;
    assert.match(bookedRef, /^DSQ-[A-Z0-9]{6}$/);

    // 8. Multi-detail input, unclear replies, incomplete name guard & duplicate slot/conversation guards
    const start2 = await api('POST', '/chat/start');
    const conv2 = start2.json.data.conversationId;

    // Unclear / non-topic inputs on purpose prompt must NEVER be saved as enquiryPurpose
    const unclearStart = await api('POST', '/chat/message', { conversationId: conv2, message: '???' });
    assert.equal(unclearStart.json.data.customerInfo.enquiryPurpose, null);
    assert.match(unclearStart.json.data.message, /didn't quite catch|enquiry/i);

    const multiRes = await api('POST', '/chat/message', {
      conversationId: conv2,
      message: 'Hi, my name is Priya Patel, phone 9123456789, email priya@example.com, I need cloud migration',
    });
    assert.equal(multiRes.json.data.customerInfo.name, 'Priya Patel');
    assert.equal(multiRes.json.data.customerInfo.phone, '9123456789');
    assert.equal(multiRes.json.data.customerInfo.email, 'priya@example.com');
    assert.match(multiRes.json.data.customerInfo.enquiryPurpose, /cloud migration/i);

    await api('POST', '/chat/message', { conversationId: conv2, message: 'AWS migration within 2 months' });
    await api('POST', '/chat/message', { conversationId: conv2, message: bookedDate });
    const conflictRes = await api('POST', '/chat/message', { conversationId: conv2, message: '4:30 PM' });
    assert.match(conflictRes.json.data.message, /unavailable/i);

    const dupDirect = await api('POST', '/appointments', {
      conversationId: convId,
      date: bookedDate,
      time: '10:00',
    });
    assert.equal(dupDirect.status, 400);

    // 8b. Mixed Name + Phone on Name Prompt & incomplete intro rejection
    const startMixed = await api('POST', '/chat/start');
    const convMixed = startMixed.json.data.conversationId;
    await api('POST', '/chat/message', { conversationId: convMixed, message: 'Product enquiry' });
    await api('POST', '/chat/message', { conversationId: convMixed, message: 'Enterprise chatbot demo' });
    const incompleteName = await api('POST', '/chat/message', { conversationId: convMixed, message: 'My name is' });
    assert.equal(incompleteName.json.data.customerInfo.name, null);
    const mixedNamePhone = await api('POST', '/chat/message', {
      conversationId: convMixed,
      message: 'Meera Nair, 9876543210',
    });
    assert.equal(mixedNamePhone.json.data.customerInfo.name, 'Meera Nair');
    assert.equal(mixedNamePhone.json.data.customerInfo.phone, '9876543210');

    // All-in-one single message including topic + contact + next Monday date & spoken time
    const startOneShot = await api('POST', '/chat/start');
    const convOneShot = startOneShot.json.data.conversationId;
    const oneShotRes = await api('POST', '/chat/message', {
      conversationId: convOneShot,
      message: 'Hi, my name is Vikram Rao, phone 9876509876, email vikram@example.com, I need cloud migration on next Monday at 2:00 p.m.',
    });
    assert.equal(oneShotRes.json.data.customerInfo.name, 'Vikram Rao');
    assert.equal(oneShotRes.json.data.customerInfo.phone, '9876509876');
    assert.equal(oneShotRes.json.data.customerInfo.email, 'vikram@example.com');
    assert.match(oneShotRes.json.data.customerInfo.enquiryPurpose, /^Cloud migration$/i);
    assert.equal(oneShotRes.json.data.appointmentDetails.time, '14:00');
    assert.equal(oneShotRes.json.data.stage, 'AWAIT_CUSTOMER_CONFIRMATION');

    // 9. Voice / "Schedule an appointment" + person name preservation ("Gaurav Pawar")
    const start3 = await api('POST', '/chat/start');
    const conv3 = start3.json.data.conversationId;
    const schedIntent = await api('POST', '/chat/message', {
      conversationId: conv3,
      message: 'Schedule an appointment',
    });
    assert.equal(schedIntent.json.data.customerInfo.enquiryPurpose, 'Appointment scheduling');
    assert.doesNotMatch(schedIntent.json.data.message, /\b(full name|mobile number|phone number|email address)\b/i);

    const gauravRes = await api('POST', '/chat/message', {
      conversationId: conv3,
      message: 'Gaurav Pawar',
    });
    assert.equal(gauravRes.json.data.customerInfo.name, 'Gaurav Pawar');
    assert.equal(gauravRes.json.data.customerInfo.enquiryPurpose, 'Appointment scheduling');

    const spokenPhone = await api('POST', '/chat/message', { conversationId: conv3, message: '98234 56789' });
    assert.equal(spokenPhone.json.data.customerInfo.phone, '9823456789');

    const spokenEmail = await api('POST', '/chat/message', {
      conversationId: conv3,
      message: 'gaurav.pawar at example dot com',
    });
    assert.equal(spokenEmail.json.data.customerInfo.email, 'gaurav.pawar@example.com');

    await api('POST', '/chat/message', { conversationId: conv3, message: bookedDate });
    await api('POST', '/chat/message', { conversationId: conv3, message: '11:00 AM' });
    const gauravBooked = await api('POST', '/chat/message', { conversationId: conv3, message: 'Yes' });
    assert.equal(gauravBooked.json.data.stage, 'BOOKING_CONFIRMED');
    assert.equal(gauravBooked.json.data.appointment.customerInfo.enquiryPurpose, 'Appointment scheduling');
    const gauravRef = gauravBooked.json.data.bookingRef;

    // 10. Server restart persistence check
    proc.kill();
    await sleep(600);
    ({ proc, logs } = startBackend(envOverrides));
    await waitForHealth(logs);

    const fetched = await api('GET', `/appointments/${gauravRef}`);
    assert.equal(fetched.status, 200);
    assert.equal(fetched.json.data.customerInfo.name, 'Gaurav Pawar');
    assert.equal(fetched.json.data.customerInfo.enquiryPurpose, 'Appointment scheduling');
    console.log(`PASS: ${label}`);
  } finally {
    proc.kill();
  }
}

async function main() {
  const hadStore = fs.existsSync(storePath);
  const storeBackup = hadStore ? fs.readFileSync(storePath, 'utf8') : null;

  try {
    if (hadStore) fs.unlinkSync(storePath);

    await runSuite('Local JSON Persistence Suite', {
      MONGODB_URI: 'mongodb://127.0.0.1:27099/unreachable_test',
    });

    if (process.env.RUN_MONGO_TEST === '1') {
      const testMongoUri = 'mongodb://127.0.0.1:27017/dasceq_regression_test';
      await runSuite('MongoDB Persistence Suite', { MONGODB_URI: testMongoUri });
      const { default: mongoose } = await import('mongoose');
      await mongoose.connect(testMongoUri);
      await mongoose.connection.dropDatabase();
      await mongoose.disconnect();
    }
  } finally {
    if (hadStore && storeBackup !== null) {
      fs.writeFileSync(storePath, storeBackup, 'utf8');
    } else if (fs.existsSync(storePath)) {
      fs.writeFileSync(storePath, JSON.stringify({ conversations: {}, appointments: {} }, null, 2), 'utf8');
    }
  }
}

main().catch((err) => {
  console.error('TEST FAILURE:', err);
  process.exit(1);
});

