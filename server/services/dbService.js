/**
 * Dual-mode persistence layer supporting MongoDB via Mongoose with automatic fallback
 * to an atomic local JSON store (`server/data/store.json`) if MongoDB is unavailable.
 */
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const config = require('../config');

const DATA_DIR = path.join(__dirname, '..', 'data');
const STORE_PATH = path.join(DATA_DIR, 'store.json');

let persistenceMode = 'local-json'; // 'mongodb' | 'local-json'
let persistenceDetail = 'Not initialized yet';
// Serializes all local JSON writes so concurrent requests never interleave file mutations
let writeQueue = Promise.resolve();

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Write JSON payload atomically via temp file + rename, falling back to serialized direct write
 * if Windows/OneDrive file watchers temporarily hold a rename lock (`EPERM`/`EBUSY`).
 */
async function writeStoreAtomically(payload) {
  const tmpPath = `${STORE_PATH}.${process.pid}.tmp`;
  fs.writeFileSync(tmpPath, payload, 'utf8');

  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      fs.renameSync(tmpPath, STORE_PATH);
      return;
    } catch (err) {
      const retryable = err && (err.code === 'EPERM' || err.code === 'EBUSY' || err.code === 'EACCES');
      if (retryable && attempt < 4) {
        await sleep(25 * (attempt + 1));
        continue;
      }
      // Fallback on Windows/OneDrive file watcher locks: overwrite directly (already serialized via writeQueue)
      try {
        fs.writeFileSync(STORE_PATH, payload, 'utf8');
        return;
      } finally {
        try {
          if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
        } catch {
          // ignore temp cleanup failure
        }
      }
    }
  }
}

function ensureLocalStore() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(STORE_PATH)) {
    const initial = { conversations: {}, appointments: {} };
    fs.writeFileSync(STORE_PATH, JSON.stringify(initial, null, 2), 'utf8');
  }
}

function readLocalStoreSync() {
  ensureLocalStore();
  try {
    const raw = fs.readFileSync(STORE_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    return {
      conversations: parsed?.conversations && typeof parsed.conversations === 'object' ? parsed.conversations : {},
      appointments: parsed?.appointments && typeof parsed.appointments === 'object' ? parsed.appointments : {},
    };
  } catch (err) {
    console.warn('⚠️ Failed to parse local store.json, initializing fresh store:', err.message);
    const fresh = { conversations: {}, appointments: {} };
    fs.writeFileSync(STORE_PATH, JSON.stringify(fresh, null, 2), 'utf8');
    return fresh;
  }
}

function mutateLocalStore(mutator) {
  const op = writeQueue.then(async () => {
    const data = readLocalStoreSync();
    const result = mutator(data);
    await writeStoreAtomically(JSON.stringify(data, null, 2));
    return result;
  });
  writeQueue = op.catch(() => {});
  return op;
}

async function initDatabase() {
  ensureLocalStore();

  if (!config.mongodbUri) {
    persistenceMode = 'local-json';
    persistenceDetail = 'MONGODB_URI not configured; using local JSON store';
    console.log(`💾 Persistence: local JSON store (${STORE_PATH})`);
    return getPersistenceStatus();
  }

  const isRemoteMongo =
    config.mongodbUri.startsWith('mongodb+srv://') ||
    (!config.mongodbUri.includes('127.0.0.1') && !config.mongodbUri.includes('localhost'));
  const timeoutMs = isRemoteMongo ? 8000 : 2500;

  try {
    mongoose.set('strictQuery', true);
    await mongoose.connect(config.mongodbUri, {
      serverSelectionTimeoutMS: timeoutMs,
      connectTimeoutMS: timeoutMs,
    });
    persistenceMode = 'mongodb';
    persistenceDetail = 'Connected to MongoDB via Mongoose';
    console.log('🗄️  Persistence: Connected to MongoDB via Mongoose');
  } catch (err) {
    try {
      await mongoose.disconnect();
    } catch {
      // ignore disconnect errors
    }
    persistenceMode = 'local-json';
    persistenceDetail = `MongoDB unavailable (${err.message}); using local JSON store`;
    console.warn(`⚠️  MongoDB unavailable (${err.message}). Falling back to local JSON store at ${STORE_PATH}`);
  }

  return getPersistenceStatus();
}

function isMongoReady() {
  return persistenceMode === 'mongodb' && mongoose.connection.readyState === 1;
}

function getPersistenceStatus() {
  return {
    mode: isMongoReady() ? 'mongodb' : 'local-json',
    mongoConnected: isMongoReady(),
    detail: persistenceDetail,
  };
}

/**
 * Cleanly disconnect Mongoose during graceful server shutdown.
 */
async function closeDatabase() {
  try {
    await writeQueue;
  } catch {
    // ignore pending write error during shutdown
  }
  if (mongoose.connection.readyState !== 0) {
    try {
      await mongoose.disconnect();
    } catch {
      // ignore disconnect errors during shutdown
    }
  }
}

module.exports = {
  initDatabase,
  closeDatabase,
  isMongoReady,
  getPersistenceStatus,
  readLocalStoreSync,
  mutateLocalStore,
  STORE_PATH,
};

