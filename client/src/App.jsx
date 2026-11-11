/**
 * Root application component orchestrating conversation state (`useChat`),
 * two-way Web Speech voice coordination (`useVoice`), and backend health polling.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import ChatWindow from './components/ChatWindow';
import useChat from './hooks/useChat';
import useVoice from './hooks/useVoice';
import { checkHealth } from './services/api';

export default function App() {
  const {
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
  } = useChat();

  const [connectionStatus, setConnectionStatus] = useState('checking'); // 'checking' | 'connected' | 'disconnected'
  const [serverAiMode, setServerAiMode] = useState(null);
  const [serverAiStatus, setServerAiStatus] = useState(null);
  // Tracks the last spoken assistant message ID so toggling Voice Mode mid-chat doesn't replay old history
  const lastSpokenMessageIdRef = useRef(null);

  const handleVoiceTranscript = useCallback(
    async (recognizedText) => {
      const trimmed = (recognizedText || '').trim();
      if (!trimmed) return;
      if (!conversationId) {
        // Passes explicit returned ID because React state won't flush within this async frame
        const convId = await startConversation();
        if (convId) {
          await sendMessage(trimmed, convId);
        }
        return;
      }
      await sendMessage(trimmed);
    },
    [conversationId, startConversation, sendMessage]
  );

  const {
    voiceMode,
    voiceState,
    isListening,
    interimTranscript,
    voiceError,
    voiceNotice,
    isSupported: voiceSupported,
    selectedVoiceName,
    clearVoiceError,
    enableVoiceMode,
    disableVoiceMode,
    resumeListening,
    pauseListening,
    pauseForProcessing,
    speak,
    stopSpeaking,
  } = useVoice({
    onSpeechResult: handleVoiceTranscript,
    isBusy: isLoading,
  });

  const refreshHealth = useCallback(async () => {
    try {
      const health = await checkHealth();
      if (health?.status === 'healthy') {
        setConnectionStatus('connected');
        if (health.aiProvider) setServerAiMode(health.aiProvider);
        if (health.aiStatus) setServerAiStatus(health.aiStatus);
      } else {
        setConnectionStatus('disconnected');
      }
    } catch {
      setConnectionStatus('disconnected');
    }
  }, []);

  useEffect(() => {
    refreshHealth();
    const timer = setInterval(refreshHealth, 30000);
    return () => clearInterval(timer);
  }, [refreshHealth]);

  // Speak new assistant replies automatically when Voice Mode is active
  useEffect(() => {
    if (!voiceMode || isLoading) return;
    const lastMsg = messages[messages.length - 1];
    if (!lastMsg || lastMsg.role !== 'assistant') return;
    if (lastSpokenMessageIdRef.current === lastMsg.id) return;

    lastSpokenMessageIdRef.current = lastMsg.id;
    const spokenText = lastMsg.isError
      ? lastMsg.errorText || 'Sorry, something went wrong. Please try again.'
      : lastMsg.content;

    if (spokenText) {
      speak(spokenText, { autoResume: true });
    }
  }, [messages, isLoading, voiceMode, speak]);

  // Start conversation, optionally sending a prompt immediately after using the returned ID
  const handleStart = useCallback(
    async (initialPrompt) => {
      const convId = await startConversation();
      if (convId) {
        setConnectionStatus('connected');
        if (typeof initialPrompt === 'string' && initialPrompt.trim()) {
          await sendMessage(initialPrompt, convId);
        }
      } else {
        refreshHealth();
      }
      return convId;
    },
    [startConversation, sendMessage, refreshHealth]
  );

  const handleToggleVoiceMode = useCallback(async () => {
    if (voiceMode) {
      disableVoiceMode();
      return;
    }

    if (!hasStarted) {
      const permitted = await enableVoiceMode({ autoListen: false });
      if (!permitted) return;

      lastSpokenMessageIdRef.current = null;
      const convId = await handleStart();
      if (!convId) {
        disableVoiceMode();
      }
      return;
    }

    // Already inside a chat: mark current last message as seen so we start listening immediately
    const currentLast = messages[messages.length - 1];
    lastSpokenMessageIdRef.current = currentLast?.id || null;
    await enableVoiceMode({ autoListen: true });
  }, [voiceMode, hasStarted, messages, disableVoiceMode, enableVoiceMode, handleStart]);

  const handleStartVoiceCall = useCallback(async () => {
    if (voiceMode) {
      disableVoiceMode();
      return;
    }
    const permitted = await enableVoiceMode({ autoListen: false });
    if (!permitted) return;
    lastSpokenMessageIdRef.current = null;
    const convId = await handleStart();
    if (!convId) {
      disableVoiceMode();
    }
  }, [voiceMode, disableVoiceMode, enableVoiceMode, handleStart]);

  const handleVoiceButtonClick = useCallback(async () => {
    if (!voiceSupported) {
      await enableVoiceMode({ autoListen: false });
      return;
    }
    if (!voiceMode) {
      await handleToggleVoiceMode();
      return;
    }
    if (voiceState === 'speaking') {
      stopSpeaking({ resumeMic: true });
      return;
    }
    if (voiceState === 'listening') {
      pauseListening();
      return;
    }
    if (voiceState === 'paused' || voiceState === 'error') {
      resumeListening();
    }
  }, [
    voiceSupported,
    voiceMode,
    voiceState,
    enableVoiceMode,
    handleToggleVoiceMode,
    stopSpeaking,
    pauseListening,
    resumeListening,
  ]);

  const handleSend = useCallback(
    async (text, overrideId = null) => {
      if (voiceMode) {
        pauseForProcessing();
      }
      await sendMessage(text, overrideId);
    },
    [voiceMode, pauseForProcessing, sendMessage]
  );

  const handleReset = useCallback(() => {
    disableVoiceMode();
    lastSpokenMessageIdRef.current = null;
    resetConversation();
  }, [disableVoiceMode, resetConversation]);

  const handleRetryStart = useCallback(() => {
    handleStart();
  }, [handleStart]);

  const handleRetryVoice = useCallback(() => {
    clearVoiceError();
    if (voiceMode) {
      resumeListening();
    } else {
      handleToggleVoiceMode();
    }
  }, [clearVoiceError, voiceMode, resumeListening, handleToggleVoiceMode]);

  return (
    <ChatWindow
      messages={messages}
      isLoading={isLoading}
      isSlowStartup={isSlowStartup}
      hasStarted={hasStarted}
      conversationId={conversationId}
      customerInfo={customerInfo}
      appointmentDetails={appointmentDetails}
      stage={stage}
      error={error}
      connectionStatus={connectionStatus}
      aiProvider={aiProvider || serverAiMode}
      aiStatus={aiStatus || serverAiStatus}
      onStart={handleStart}
      onStartVoiceCall={handleStartVoiceCall}
      onRetryStart={handleRetryStart}
      onReset={handleReset}
      onSend={handleSend}
      voiceMode={voiceMode}
      voiceState={voiceState}
      isListening={isListening}
      interimTranscript={interimTranscript}
      voiceError={voiceError}
      voiceNotice={voiceNotice}
      voiceSupported={voiceSupported}
      selectedVoiceName={selectedVoiceName}
      onToggleVoiceMode={handleToggleVoiceMode}
      onVoiceButtonClick={handleVoiceButtonClick}
      onPauseListening={pauseListening}
      onResumeListening={resumeListening}
      onStopSpeaking={stopSpeaking}
      onDismissVoiceError={clearVoiceError}
      onRetryVoice={handleRetryVoice}
    />
  );
}
