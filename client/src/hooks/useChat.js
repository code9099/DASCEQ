/**
 * Manages conversation lifecycle, message history, error recovery, and booking state.
 * Uses `conversationIdRef` alongside React state so immediate follow-up prompts after
 * `startConversation()` never read a stale `null` conversation ID.
 */
import { useState, useCallback, useRef } from 'react';
import { startChat, sendChatMessage } from '../services/api';
import { generateId } from '../utils/helpers';

/**
 * Normalize Axios/network errors into user-readable retry messages.
 */
function extractErrorMessage(err, fallback) {
  if (err?.response?.data?.error) return err.response.data.error;
  if (err?.code === 'ECONNABORTED') return 'Request timed out. Please try again.';
  if (err?.message === 'Network Error') {
    return 'Unable to reach the server. Please verify the backend is running and try again.';
  }
  return err?.message || fallback;
}

export default function useChat() {
  const [messages, setMessages] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSlowStartup, setIsSlowStartup] = useState(false);
  const [conversationId, setConversationId] = useState(null);
  const conversationIdRef = useRef(null);
  const [customerInfo, setCustomerInfo] = useState({});
  const [appointmentDetails, setAppointmentDetails] = useState({});
  const [stage, setStage] = useState(null);
  const [aiProvider, setAiProvider] = useState(null);
  const [aiStatus, setAiStatus] = useState(null);
  const [error, setError] = useState(null);
  const [hasStarted, setHasStarted] = useState(false);

  const startConversation = useCallback(async () => {
    setIsLoading(true);
    setIsSlowStartup(false);
    setError(null);
    const slowTimer = setTimeout(() => setIsSlowStartup(true), 3500);
    try {
      const data = await startChat();
      if (!data?.conversationId || !data?.message) {
        throw new Error('Unexpected response format from server.');
      }
      conversationIdRef.current = data.conversationId;
      setConversationId(data.conversationId);
      setHasStarted(true);
      setStage(data.stage || 'UNDERSTAND_INTENT');
      if (data.aiProvider) setAiProvider(data.aiProvider);
      if (data.aiStatus) setAiStatus(data.aiStatus);
      setCustomerInfo({});
      setAppointmentDetails({});

      const aiMsg = {
        id: generateId(),
        role: 'assistant',
        content: data.message,
        timestamp: new Date().toISOString(),
        isBooking: false,
        availableSlots: null,
        quickReplies: data.quickReplies || [],
      };
      setMessages([aiMsg]);
      return data.conversationId;
    } catch (err) {
      const message = extractErrorMessage(
        err,
        'Failed to start conversation. Please try again.'
      );
      setError(message);
      setHasStarted(true);
      setMessages([]);
      return null;
    } finally {
      clearTimeout(slowTimer);
      setIsSlowStartup(false);
      setIsLoading(false);
    }
  }, []);

  const sendMessage = useCallback(async (text, overrideConversationId = null) => {
    const trimmed = typeof text === 'string' ? text.trim() : '';
    const activeConvId = overrideConversationId || conversationIdRef.current;
    if (!trimmed || !activeConvId) return;

    setError(null);

    const userMsg = {
      id: generateId(),
      role: 'user',
      content: trimmed,
      timestamp: new Date().toISOString(),
      isBooking: false,
    };
    setMessages((prev) => [...prev, userMsg]);
    setIsLoading(true);

    try {
      const data = await sendChatMessage(activeConvId, trimmed);

      if (data.customerInfo) {
        setCustomerInfo(data.customerInfo);
      }
      if (data.appointmentDetails) {
        setAppointmentDetails(data.appointmentDetails);
      }
      if (data.stage) {
        setStage(data.stage);
      }
      if (data.aiProvider) {
        setAiProvider(data.aiProvider);
      }
      if (data.aiStatus) {
        setAiStatus(data.aiStatus);
      }

      const bookingObj =
        data.appointment ||
        data.booking ||
        (data.stage === 'BOOKING_CONFIRMED' && data.bookingRef
          ? {
              bookingRef: data.bookingRef,
              customerInfo: data.customerInfo,
              date: data.appointmentDetails?.date,
              time: data.appointmentDetails?.time,
              status: 'confirmed',
            }
          : null);

      const aiMsg = {
        id: generateId(),
        role: 'assistant',
        content: data.message,
        timestamp: new Date().toISOString(),
        isBooking: Boolean(bookingObj),
        booking: bookingObj,
        availableSlots:
          Array.isArray(data.availableSlots) && data.availableSlots.length > 0
            ? data.availableSlots
            : null,
        quickReplies: data.quickReplies || [],
      };

      setMessages((prev) => [...prev, aiMsg]);
    } catch (err) {
      const errMessage = extractErrorMessage(err, 'Something went wrong. Please try again.');
      const errMsg = {
        id: generateId(),
        role: 'assistant',
        content: null,
        timestamp: new Date().toISOString(),
        isBooking: false,
        isError: true,
        errorText: errMessage,
        retryText: trimmed,
      };
      setMessages((prev) => [...prev, errMsg]);
      setError(errMessage);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const resetConversation = useCallback(() => {
    conversationIdRef.current = null;
    setConversationId(null);
    setMessages([]);
    setCustomerInfo({});
    setAppointmentDetails({});
    setStage(null);
    setAiProvider(null);
    setAiStatus(null);
    setError(null);
    setHasStarted(false);
    setIsSlowStartup(false);
    setIsLoading(false);
  }, []);

  return {
    messages,
    isLoading,
    isSlowStartup,
    conversationId,
    customerInfo,
    appointmentDetails,
    stage,
    aiProvider,
    aiStatus,
    error,
    hasStarted,
    startConversation,
    sendMessage,
    resetConversation,
  };
}
