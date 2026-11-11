/**
 * HTTP API client communicating with the Express backend.
 * Uses Vite dev proxy (`/api`) by default or `VITE_API_URL` in standalone deployments,
 * unwrapping `{ success, data }` envelopes transparently.
 */
import axios from 'axios';

const API = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  headers: { 'Content-Type': 'application/json' },
  timeout: 45000,
});

/** Check server health, active AI provider (`gemini` | `demo`), and persistence mode. */
export const checkHealth = () =>
  API.get('/health').then((res) => res.data?.data ?? res.data);

/** Start a new conversation and receive its `conversationId` and welcome message. */
export const startChat = () =>
  API.post('/chat/start').then((res) => res.data?.data ?? res.data);

/** Send a user turn to the backend conversation engine. */
export const sendChatMessage = (conversationId, message) =>
  API.post('/chat/message', { conversationId, message }).then((res) => res.data?.data ?? res.data);

/** Fetch full transcript and extracted state for a conversation ID. */
export const getChatHistory = (conversationId) =>
  API.get(`/chat/${encodeURIComponent(conversationId)}`).then((res) => res.data?.data ?? res.data);

/** Fetch available 30-minute IST booking slots for a given `YYYY-MM-DD` date. */
export const getAvailability = (date) =>
  API.get('/appointments/availability', { params: { date } }).then((res) => res.data?.data ?? res.data);

/** Look up a confirmed/cancelled appointment by UUID or `DSQ-XXXXXX` booking reference. */
export const getAppointment = (idOrRef) =>
  API.get(`/appointments/${encodeURIComponent(idOrRef)}`).then((res) => res.data?.data ?? res.data);

export default API;
