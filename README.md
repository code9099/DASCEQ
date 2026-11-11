# Dasceq AI Customer Enquiry & Appointment Assistant

An AI-powered **Customer Enquiry, Appointment Scheduling, and Two-Way Voice Receptionist** built with **React 19**, **Vite 6**, **Tailwind CSS 3**, **Node.js / Express**, **MongoDB (Mongoose)** with atomic local JSON fallback, **Google GenAI (`@google/genai`)**, and browser-native **Web Speech API** + **`speechSynthesis`**.

---

## 1. Project Overview

The assistant provides an executive **Midnight Navy** web experience supporting both text conversations and opt-in two-way voice calls. It welcomes customers, answers verified questions about Dasceq services and business hours, politely redirects off-topic trivia, collects and validates required details (`name`, `phone`, `email`, `enquiryPurpose`), asks context-aware follow-up questions, checks real 30-minute business-hour slot availability in **Asia/Kolkata (IST)**, prevents duplicate bookings, enforces an explicit confirmation gate (`Yes` / `No`), and blocks prompt-injection / data-exfiltration attempts at both the backend and AI prompt layers.

---

## 2. Main Features

- **Executive Midnight Navy SaaS Interface**:
  - Branded header (`Dasceq · Intelligent Customer Experience`) with live health status pill, accessible Voice Mode indicator (`Voice Mode Off`, `Listening`, `Processing`, `Speaking`, `Voice Error`, `Voice Unsupported`), and **New Chat** action.
  - Hero welcome screen featuring the interactive 5-state **`VoiceOrb`** (`OFF`, `LISTENING`, `PROCESSING`, `SPEAKING`, `ERROR`), **Start Conversation** & **Start Voice Call** launch controls, quick-start capability cards, and working-hours metadata.
  - Smooth, lightweight CSS/SVG animations (entrance fades, shimmer loading skeleton, `BookingCard` reveal animation, `VoiceOrb` waveform bars & halos) respecting `prefers-reduced-motion`.
- **Grounded Company Knowledge & Off-Topic Redirection**:
  - Configurable company knowledge base in `server/config/companyProfile.js` (overridable via `COMPANY_*` environment variables, including `COMPANY_SERVICES`).
  - When `COMPANY_SERVICES` is unset, safely explains assistant capabilities (`Customer Enquiries`, `Appointment Scheduling`, `Booking Lookup`) and IST booking hours without fabricating unverified service lines or prices, while politely redirecting unrelated general trivia (*"Who is Sam Altman?"*) without polluting `enquiryPurpose`.
- **Customer Detail Extraction & Validation**:
  - Collects full name, 10-digit Indian mobile number (`6-9` prefix, `+91`/leading `0` normalized), email address, and enquiry purpose.
  - Supports multi-detail messages in a single turn, spaced spoken digits, spoken `"at"` / `"dot"` emails, and inline corrections (*"change my name to ..."*).
  - Gives explicit validation errors and never treats greetings/weekdays (`hello`, `tomorrow`, `Monday`) as names or customer names (`Gaurav Pawar`) as enquiry purposes.
- **Two-Way Voice Mode (Inbound Call Experience)**:
  - Uses browser-native Web Speech recognition (`SpeechRecognition` / `webkitSpeechRecognition`) and `window.speechSynthesis` (no paid third-party voice APIs).
  - Coordinated turn-taking pauses mic capture during assistant playback (`350ms` post-speech echo cooldown), condenses 4+ slot bullet lists into crisp spoken summaries while keeping every slot readable on screen, handles recoverable mic/network errors with **Retry Mic**, pauses on 2x silence (`Mic Paused`) or typing, and stops immediately when turned off.
- **IST Appointment Scheduling, Slot Picker & Calendar Integration**:
  - Natural date (`tomorrow`, `next Monday`, `16 Nov`, `YYYY-MM-DD`) and time (`2 PM`, `2:00 p.m.`, `4 o'clock`, `4:30 PM`, `14:00`) parsing in `Asia/Kolkata`.
  - Business hours: **Monday–Friday, 9:00 AM – 6:00 PM IST** (30-minute slots from `09:00` to `17:30`).
  - Interactive Morning/Afternoon IST slot picker showing all available 30-minute intervals directly in chat, plus live 6-step enquiry & booking progress tracking (`Topic`, `Name`, `Phone`, `Email`, `Date & Time`, `Confirmed`).
  - Rejects past dates, elapsed slots on today's date, weekends, out-of-hours times, already booked slots, duplicate bookings per conversation, and duplicate bookings per phone/email on the same date.
  - Requires explicit customer confirmation (`AWAIT_CUSTOMER_CONFIRMATION`) before persisting and issuing a `DSQ-XXXXXX` booking reference.
  - Confirmed `BookingCard` includes one-click **Copy Reference**, **Add to Google Calendar** (pre-filled IST/UTC event template), and **Download `.ics`** invite export.
- **Layered Security & Prompt-Injection Defence**:
  - Pre-AI and post-AI security checks (`server/services/securityService.js`), untrusted `<customer_message>` prompt isolation, output Data Loss Prevention (DLP) sanitization, NoSQL `$`-operator payload rejection, strict parameter validation, malformed JSON handling, PII/secret log redaction, Helmet security headers, strict production CORS allowlist, and rate limiting.
- **Gemini AI Integration + Honest Graceful Fallback**:
  - Uses `@google/genai` (`v1beta`) structured JSON output (`responseSchema`) with per-model cooldowns, startup credential probe (`models.list`), automatic Flash / Flash-Lite failover, and immediate `DemoProvider` fallback when offline, quota-limited (`429`), or unconfigured.
  - Exposes truthful live status (`aiProvider`, `aiStatus`, `aiModel`) via `/api/health` and chat responses so the Header badge never claims Gemini is active when `DemoProvider` is handling replies (`Gemini AI`, `Gemini Ready`, `Demo Fallback`, or `Demo Mode`).

---

## 3. Technology Stack

| Layer | Technologies |
| :--- | :--- |
| **Frontend** | React 19, Vite 6, Tailwind CSS 3 (`@tailwindcss/forms`), Axios, Lucide Icons, Web Speech API (`SpeechRecognition`, `speechSynthesis`) |
| **Backend** | Node.js, Express 4, Helmet, CORS, Express Rate Limit, UUID |
| **AI & NLP** | `@google/genai` (`v1beta`, `responseSchema`) + deterministic `DemoProvider` extractor/fallback |
| **Security** | Layered `securityService.js` (prompt-injection & exfiltration detection, output DLP, NoSQL key rejection, PII log redaction) |
| **Persistence** | MongoDB + Mongoose 9 (with compound indexes and atomic serialized local JSON fallback at `server/data/store.json`) |

---

## 4. Folder Structure

```text
Dasceq/
├── .gitignore
├── README.md
├── client/                              # React + Vite frontend
│   ├── .env.example                     # Frontend env var reference (VITE_API_URL, VITE_PROXY_TARGET)
│   ├── index.html
│   ├── package.json
│   ├── postcss.config.js
│   ├── tailwind.config.js
│   ├── vercel.json                        # Vercel SPA rewrite & security headers
│   ├── vite.config.js                   # Dev server & /api proxy configuration
│   ├── public/
│   │   ├── _redirects                     # Netlify SPA fallback rewrite
│   │   ├── favicon.svg                    # Branded Dasceq SVG favicon
│   │   └── vite.svg
│   └── src/
│       ├── main.jsx                     # React root mount
│       ├── index.css                    # Midnight Navy styling, keyframes & prefers-reduced-motion
│       ├── App.jsx                      # Top-level chat + voice orchestration
│       ├── services/
│       │   └── api.js                   # Axios client & response envelope unwrapping
│       ├── hooks/
│       │   ├── useChat.js               # Conversation state, booking mapping, error recovery
│       │   ├── useVoice.js              # Two-way Web Speech recognition, concise TTS & error recovery
│       │   └── useAutoScroll.js         # Smooth scroll-to-bottom helper
│       ├── components/
│       │   ├── Header.jsx               # Brand bar, Voice Mode ON/OFF/Error pill, New Chat, live status
│       │   ├── WelcomeScreen.jsx        # Hero VoiceOrb showcase, Start Text/Voice CTAs & capability cards
│       │   ├── VoiceOrb.jsx             # Reusable 5-state Voice Orb (off/listening/processing/speaking/error)
│       │   ├── ChatWindow.jsx           # Main viewport, loading skeleton, error retry, message list & composer
│       │   ├── MessageBubble.jsx        # User/assistant/error/booking message rendering
│       │   ├── BookingCard.jsx          # Executive appointment confirmation/status card
│       │   ├── MessageInput.jsx         # Text input + VoiceButton (usable alongside Voice Mode)
│       │   ├── VoiceButton.jsx          # Mic control inside composer
│       │   ├── VoiceStatusBar.jsx       # Compact VoiceOrb, interim transcript, Retry Mic, Pause/Interrupt/Off
│       │   ├── SuggestedPrompts.jsx     # Dynamic quick-reply pills
│       │   └── TypingIndicator.jsx      # Assistant typing animation
│       └── utils/
│           └── helpers.js               # Date, slot time, timestamp & message ID formatters
└── server/                              # Express REST API backend
    ├── .env.example                     # Sample backend environment variables
    ├── package.json
    ├── index.js                         # App bootstrap, trust proxy, Helmet, strict CORS, rate limit, graceful shutdown
    ├── config/
    │   ├── index.js                     # Env loading, production CORS hardening & startup validation
    │   └── companyProfile.js            # Configurable verified Dasceq services, overview & hours
    ├── routes/
    │   ├── chatRoutes.js                # /api/chat/* endpoints
    │   └── appointmentRoutes.js         # /api/appointments/* endpoints
    ├── controllers/
    │   ├── chatController.js            # HTTP handlers for chat lifecycle
    │   └── appointmentController.js     # HTTP handlers for availability, booking & lookup
    ├── middleware/
    │   ├── validator.js                 # Request schema, NoSQL key & ID/ref parameter validation
    │   └── errorHandler.js              # Operational AppError class, malformed JSON 400 & redacted logs
    ├── models/
    │   ├── Conversation.js              # STAGES enum, Mongoose schema/indexes + local JSON repository
    │   └── Appointment.js               # Booking persistence, compound indexes, ref lookup & duplicate checks
    ├── services/
    │   ├── securityService.js           # Prompt-injection guard, exfiltration blocker, output DLP & PII redactor
    │   ├── aiService.js                 # GeminiProvider + DemoProvider + company/off-topic classifier
    │   ├── conversationService.js       # Authoritative multi-turn state machine & confirmation gate
    │   ├── customerService.js           # Name, phone, email, purpose validation & name disambiguation
    │   ├── availabilityService.js       # 30-min IST slot generator & conflict filtering
    │   ├── appointmentService.js        # Booking rules, creation & lookup
    │   └── dbService.js                 # MongoDB connector, graceful disconnect & atomic JSON fallback store
    ├── tests/
    │   ├── apiRegression.test.mjs       # Backend API, booking & persistence regression suite
    │   └── securityAndIntelligence.test.mjs # Prompt injection, DLP, off-topic & prod CORS verification suite
    ├── utils/
    │   └── helpers.js                   # Asia/Kolkata IST helpers, natural parsers & DSQ ref generator
    └── data/
        └── store.json                   # Local JSON fallback storage (gitignored)
```

---

## 5. Local Development Setup

### Backend Setup

```bash
cd server
npm install
cp .env.example .env    # On Windows PowerShell: Copy-Item .env.example .env
```

### Frontend Setup

```bash
cd client
npm install
```

Start backend and frontend in two terminals:

**Terminal 1 — Backend:**
```bash
cd server
npm start        # or `npm run dev` for watch mode
```
*(If port `5000` is occupied locally, set `PORT=5001` in `server/.env` and launch the client with `VITE_PROXY_TARGET=http://localhost:5001 npm run dev`.)*

**Terminal 2 — Frontend:**
```bash
cd client
npm run dev
```

Open `http://localhost:5173` in **Google Chrome** or **Microsoft Edge**.

---

## 6. Environment Variables

### Backend (`server/.env`)

| Variable | Default | Description |
| :--- | :--- | :--- |
| `PORT` | `5000` | Express HTTP port (`1–65535`). |
| `NODE_ENV` | `development` | Set to `production` in deployed environments (enables strict CORS, HSTS, hides stack traces). |
| `GEMINI_API_KEY` | *(empty)* | Google Gemini API key (strictly server-side). Leave unset to run deterministically with `DemoProvider`. |
| `GEMINI_MODEL` | `gemini-3-flash-preview` | Primary Gemini model with structured JSON output (`@google/genai`). |
| `AI_TIMEOUT_MS` | `15000` | Timeout in ms for Gemini calls before automatic fallback. |
| `MONGODB_URI` | `mongodb://127.0.0.1:27017/dasceq_chatbot` | MongoDB connection string (falls back to `server/data/store.json` if unreachable). |
| `CORS_ORIGIN` | `http://localhost:5173,http://127.0.0.1:5173` | Comma-separated allowed browser origins. Wildcard `*` and localhost fallbacks are disabled in `production`. |
| `TRUST_PROXY` | `true` in production / `false` in dev | Enables Express `trust proxy` behind Render/Railway/Vercel/NGINX so rate limiting uses client IP accurately. |
| `RATE_LIMIT_MAX` | `200` | Maximum `/api/*` requests per 15-minute window per IP (`/api/health` is excluded). |
| `COMPANY_NAME` | `Dasceq` | Configurable brand title shown in assistant greetings/health response. |
| `COMPANY_SUBTITLE` | `Intelligent Customer Experience` | Brand subtitle for AI grounding. |
| `COMPANY_OVERVIEW` | Safe unconfigured fallback note | Approved business overview paragraph shown on company enquiries. |
| `COMPANY_SERVICES` | *(empty — honest fallback)* | Optional service list in `Name: Summary; Name 2: Summary 2` or JSON array format. |
| `COMPANY_WORKING_HOURS` | Mon–Fri, 9:00 AM–6:00 PM IST | Verified working-hours statement for AI replies. |
| `COMPANY_PRICING_NOTE` | Consultation-based scoping note | Approved response for pricing questions without fabricating quotes. |

### Frontend (`client/.env` / build-time)

| Variable | Default | Description |
| :--- | :--- | :--- |
| `VITE_API_URL` | `/api` | Deployed backend API URL (e.g., `https://dasceq-api.onrender.com/api`). |
| `VITE_PROXY_TARGET` | `http://localhost:5000` | Vite dev server proxy target for `/api`. |

---

## 7. Security & AI Intelligence Architecture

1. **Prompt-Injection & Data Exfiltration Defence (`server/services/securityService.js`)**:
   - Inspects both raw and stripped text *before* any AI call or stage transition to block system-prompt extraction, API key / `.env` / source dumping (`GEMINI_API_KEY`, `MONGODB_URI`, `process.env`), fake admin/developer overrides, confirmation/validation bypasses, SQL/NoSQL probes, and customer-list or cross-customer PII queries.
   - Wraps customer utterances inside `<customer_message>...</customer_message>` delimiters in Gemini prompts.
   - Runs `sanitizeAssistantOutput()` on every outgoing response so internal markers or secrets can never leak.
   - Preserves `customerInfo` and active booking stage (`AWAIT_CUSTOMER_CONFIRMATION`, etc.) during rejected attacks.
2. **HTTP & Persistence Hardening**:
   - `express-mongo`-style `$`-operator keys are rejected with `400` in body and route params (`containsUnsafeKeys`, `validateAppointmentIdentifier`).
   - Malformed JSON payloads return clean `400` JSON errors with zero stack traces in production.
   - Console and error logs run through `redactForLog()` so customer emails, 10-digit phone numbers, API keys, and MongoDB credentials are masked.
   - Graceful `SIGTERM`/`SIGINT` shutdown closes incoming HTTP connections cleanly and flushes/disconnects database state.

---

## 8. Voice Experience, Limitations & Future Upgrades

### How Browser Voice Mode Works
- **Opt-in only**: Never activates microphone recording on page load. Activated via **Start Voice Call**, the **Voice Orb**, header toggle, or composer mic button.
- **No echo feedback loop**: `SpeechRecognition` is aborted *before* `speechSynthesis` plays, and resumes listening only after a `350ms` post-speech cooldown.
- **Concise receptionist TTS**: Multi-slot schedules (4+ slots) remain visible in chat while spoken aloud concisely, and `DSQ-XXXXXX` references are read clearly.
- **Error recovery**: Recoverable audio/speech-service interruptions transition the Voice Orb to `ERROR` and offer **Retry Mic** without losing conversation state.

### Known Browser Speech Limitations (No Paid APIs Used)
- Two-way Voice Mode uses the browser-native **Web Speech API** (`SpeechRecognition` / `webkitSpeechRecognition`) and `window.speechSynthesis` so the app runs with zero paid voice subscriptions.
- **Browser support**: Works reliably in **Google Chrome** and **Microsoft Edge** on HTTPS or `localhost`. **Firefox** and several mobile browsers lack `SpeechRecognition`; unsupported browsers display an explicit notice while keeping text chat fully functional.
- Voice quality depends on operating system / browser voices (`en-IN`, Google/Microsoft voices preferred automatically when present).

### Physical Hardware Voice Verification Checklist (Manual Run)
Automated headless tests verify turn-taking state logic with Web Speech API test doubles; run this checklist manually on a real microphone and speakers before release:
1. Open `http://localhost:5173` (or HTTPS deployment) in **Google Chrome** or **Microsoft Edge**.
2. Confirm microphone does **not** activate automatically on load (`Voice Mode Off`, VoiceOrb in `off` state).
3. Click **Start Voice Call** -> grant Microphone permission when prompted (`Requesting Mic Permission…` -> `Speaking…` during welcome audio -> `Listening…` after `350ms` cooldown).
4. Verify no speaker echo or false recognition loop while assistant audio plays.
5. Speak a full booking flow (e.g., *"Schedule an appointment"*, full name, spaced digits mobile number, `"name at example dot com"` email, weekday, time slot) and verify clear natural English playback.
6. Test **Interrupt**, **Pause Mic**, **Resume Mic**, and turning **Voice Off** mid-speech (confirm audio stops immediately).
7. Verify denial recovery: block Mic permission in the browser site settings -> click **Start Voice Call** -> confirm actionable denial banner appears and text chat remains usable.

### Optional Future Production Voice / Telephony Upgrades
- **Neural STT/TTS**: Swap the Web Speech adapter in `client/src/hooks/useVoice.js` with Deepgram / Whisper STT and ElevenLabs or Gemini Live native audio streams for consistent browser-independent voice quality.
- **Inbound Phone Telephony**: Connect Twilio Programmable Voice Media Streams to the backend conversation engine (`/api/chat/message`) to serve real PSTN phone callers.

---

## 9. Production Deployment Guide

### A. MongoDB Atlas (Database)
1. Create a MongoDB Atlas cluster and database user, and copy the SRV connection string (`mongodb+srv://...`).
2. Add it as `MONGODB_URI` in your backend host's environment variables.

### B. Backend Deployment (Render / Railway / Fly.io)
1. Set root/working directory to `server/`.
2. Build command: `npm install` | Start command: `npm start`.
3. Configure environment variables:
   - `NODE_ENV=production`
   - `TRUST_PROXY=true`
   - `MONGODB_URI=<your-atlas-uri>`
   - `GEMINI_API_KEY=<your-gemini-key>` *(optional — falls back to `DemoProvider` if omitted)*
   - `CORS_ORIGIN=https://<your-frontend-domain>` *(comma-separated for multiple domains; do not use `*`)*
4. Set health check path to `/api/health` and confirm HTTP `200` with `"status": "healthy"`.

### C. Frontend Deployment (Vercel / Netlify)
1. Set root/base directory to `client/`.
2. Build command: `npm run build` | Output directory: `dist`.
3. Add environment variable:
   - `VITE_API_URL=https://<your-backend-domain>/api`
4. SPA fallback rewrite rules (`client/vercel.json` for Vercel and `client/public/_redirects` for Netlify) are pre-configured.

---

## 10. API Endpoints

| Method & Endpoint | Description | Request Body / Query |
| :--- | :--- | :--- |
| `GET /api/health` | Health status, `aiProvider`, `aiStatus`, `aiModel`, `persistence`, `mongoConnected` | — |
| `POST /api/chat/start` | Initialize conversation & return welcome message | — |
| `POST /api/chat/message` | Process customer turn & return reply, state, slots, `appointment` | `{ conversationId, message }` |
| `GET /api/chat/:id` | Retrieve stored conversation messages and metadata | Path param `id` (UUID) |
| `GET /api/appointments/availability` | Get 30-min IST availability for a date | Query `?date=YYYY-MM-DD` |
| `POST /api/appointments` | Direct appointment booking (requires complete `customerInfo`) | `{ conversationId, date, time }` |
| `GET /api/appointments/:id` | Look up appointment by UUID or `DSQ-XXXXXX` booking reference | Path param `id` |

---

## 11. Running Automated Tests & Build Checks

### Backend API, Booking & Security Suites
```bash
cd server
npm test
```
Runs both:
1. `tests/apiRegression.test.mjs` — end-to-end booking flow, validation, IST slot rules, confirmation gate, duplicate prevention, restart persistence.
2. `tests/securityAndIntelligence.test.mjs` — prompt-injection & exfiltration attacks, confirmation-bypass defence, output DLP, PII log redaction, NoSQL payload rejection, production CORS rejection, off-topic redirect, and company-grounded services verification.

To run against live MongoDB (`mongodb://127.0.0.1:27017`):
```bash
# Windows PowerShell
$env:RUN_MONGO_TEST="1"; npm test; Remove-Item Env:RUN_MONGO_TEST
```

### Frontend Production Build & Backend Syntax Check
```bash
cd client && npm run build
cd ../server && node --check index.js && node --check config/companyProfile.js && node --check services/securityService.js && node --check services/aiService.js && node --check services/conversationService.js
```
