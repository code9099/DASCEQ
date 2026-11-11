/**
 * Main conversational viewport switching between the Welcome landing view and active chat thread.
 * Uses `100dvh` height so the composer and `VoiceStatusBar` remain unclipped on mobile keyboards/toolbars.
 */
import { AlertCircle, RefreshCw, Check } from 'lucide-react';
import Header from './Header';
import WelcomeScreen from './WelcomeScreen';
import MessageBubble from './MessageBubble';
import MessageInput from './MessageInput';
import TypingIndicator from './TypingIndicator';
import SuggestedPrompts from './SuggestedPrompts';
import VoiceStatusBar from './VoiceStatusBar';
import useAutoScroll from '../hooks/useAutoScroll';

const INITIAL_PROMPTS = [
  'Schedule an appointment',
  'Product enquiry',
  'General support',
  'Check booking status',
];

function BookingProgressStrip({ customerInfo, appointmentDetails, stage }) {
  const hasTopic = Boolean(customerInfo?.enquiryPurpose);
  const hasName = Boolean(customerInfo?.name);
  const hasPhone = Boolean(customerInfo?.phone);
  const hasEmail = Boolean(customerInfo?.email);
  const hasSlot = Boolean(appointmentDetails?.date && appointmentDetails?.time) || stage === 'BOOKING_CONFIRMED';
  const isConfirmed = stage === 'BOOKING_CONFIRMED';

  const steps = [
    { key: 'topic', label: 'Topic', done: hasTopic },
    { key: 'name', label: 'Name', done: hasName },
    { key: 'phone', label: 'Phone', done: hasPhone },
    { key: 'email', label: 'Email', done: hasEmail },
    { key: 'slot', label: 'Date & Time', done: hasSlot },
    { key: 'confirmed', label: 'Confirmed', done: isConfirmed },
  ];

  const firstPendingIndex = steps.findIndex((s) => !s.done);

  return (
    <div
      aria-label="Enquiry and booking progress"
      className="px-3 sm:px-5 py-2 bg-[#080F1D]/95 border-b border-slate-800/80 shrink-0"
    >
      <div className="max-w-3xl mx-auto flex flex-wrap items-center justify-center gap-1.5 sm:gap-2">
        {steps.map((step, idx) => {
          const isCurrent = idx === firstPendingIndex;
          return (
            <span
              key={step.key}
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border transition-colors ${
                step.done
                  ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/35'
                  : isCurrent
                  ? 'bg-blue-500/15 text-cyan-200 border-blue-400/40'
                  : 'bg-[#111C30]/80 text-slate-400 border-slate-800'
              }`}
            >
              {step.done && <Check className="w-3 h-3 text-emerald-400 shrink-0" />}
              <span>{step.label}</span>
            </span>
          );
        })}
      </div>
    </div>
  );
}

export default function ChatWindow({
  messages,
  isLoading,
  isSlowStartup = false,
  hasStarted,
  conversationId,
  customerInfo = {},
  appointmentDetails = {},
  stage = null,
  error,
  connectionStatus,
  aiProvider,
  aiStatus,
  onStart,
  onStartVoiceCall,
  onRetryStart,
  onReset,
  onSend,
  voiceMode,
  voiceState,
  isListening,
  interimTranscript,
  voiceError,
  voiceNotice,
  voiceSupported,
  selectedVoiceName,
  onToggleVoiceMode,
  onVoiceButtonClick,
  onPauseListening,
  onResumeListening,
  onStopSpeaking,
  onDismissVoiceError,
  onRetryVoice,
}) {
  const scrollRef = useAutoScroll(messages);

  const handlePrompt = async (prompt) => {
    if (!hasStarted) {
      await onStart(prompt);
    } else {
      await onSend(prompt);
    }
  };

  const lastMessage = messages[messages.length - 1];
  const hasSlotPickerOnLastMessage =
    lastMessage?.role === 'assistant' && !lastMessage?.isError && lastMessage?.availableSlots?.length > 0;
  const dynamicPrompts =
    hasSlotPickerOnLastMessage
      ? []
      : lastMessage?.role === 'assistant' && !lastMessage?.isError && lastMessage?.quickReplies?.length
      ? lastMessage.quickReplies
      : messages.length === 1 && !lastMessage?.isError
      ? INITIAL_PROMPTS
      : [];

  return (
    <div className="flex flex-col h-[100dvh] max-h-[100dvh] w-full bg-[#060B16] overflow-hidden">
      <Header
        connectionStatus={connectionStatus}
        aiProvider={aiProvider}
        aiStatus={aiStatus}
        hasStarted={hasStarted}
        onReset={onReset}
        voiceMode={voiceMode}
        voiceState={voiceState}
        voiceSupported={voiceSupported}
        onToggleVoiceMode={onToggleVoiceMode}
      />

      {!hasStarted ? (
        <>
          <VoiceStatusBar
            voiceMode={voiceMode}
            voiceState={voiceState}
            interimTranscript={interimTranscript}
            voiceError={voiceError}
            voiceNotice={voiceNotice}
            selectedVoiceName={selectedVoiceName}
            onDismissError={onDismissVoiceError}
            onTurnOffVoice={onToggleVoiceMode}
            onRetryVoice={onRetryVoice}
          />
          <WelcomeScreen
            onStart={() => onStart()}
            onStartVoice={onStartVoiceCall}
            onPrompt={handlePrompt}
            isLoading={isLoading}
            voiceSupported={voiceSupported}
            voiceMode={voiceMode}
            voiceState={voiceState}
            voiceError={voiceError}
          />
        </>
      ) : (
        <>
          {messages.length > 1 && (
            <BookingProgressStrip
              customerInfo={customerInfo}
              appointmentDetails={appointmentDetails}
              stage={stage}
            />
          )}

          {/* Centered conversation viewport */}
          <div className="flex-1 overflow-y-auto py-5 bg-[#0B1220] min-h-0">
            <div className="max-w-3xl mx-auto w-full space-y-4">
              {messages.length === 0 && isLoading ? (
                <div className="px-4 sm:px-6 space-y-4 animate-fadeInUp" aria-label="Loading conversation">
                  <div className="flex gap-3 items-start">
                    <div className="w-8 h-8 rounded-full animate-shimmer shrink-0" />
                    <div className="space-y-2 flex-1 max-w-md">
                      <div className="h-4 w-3/4 rounded-lg animate-shimmer" />
                      <div className="h-4 w-1/2 rounded-lg animate-shimmer" />
                      <div className="h-10 w-full rounded-2xl animate-shimmer mt-2" />
                    </div>
                  </div>
                  {isSlowStartup && (
                    <p className="text-xs text-cyan-300/90 pl-11">
                      Waking up server — free cloud hosting can take up to ~30 seconds on initial visit…
                    </p>
                  )}
                </div>
              ) : messages.length === 0 && error && !isLoading ? (
                <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
                  <div className="max-w-md w-full rounded-2xl bg-red-500/10 border border-red-500/30 p-6 space-y-4 shadow-xl">
                    <div className="w-12 h-12 rounded-full bg-red-500/20 flex items-center justify-center mx-auto">
                      <AlertCircle className="w-6 h-6 text-red-400" />
                    </div>
                    <div className="space-y-1">
                      <h3 className="text-base font-semibold text-red-200">Unable to Start Chat</h3>
                      <p className="text-sm text-red-300/90">{error}</p>
                    </div>
                    <div className="flex items-center justify-center gap-3">
                      <button
                        type="button"
                        onClick={onRetryStart}
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition-colors"
                      >
                        <RefreshCw className="w-4 h-4" />
                        Retry Connection
                      </button>
                      <button
                        type="button"
                        onClick={onReset}
                        className="px-4 py-2 rounded-lg bg-[#18243B] hover:bg-slate-700 text-slate-200 text-sm font-medium transition-colors"
                      >
                        Back
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  {messages.map((msg, idx) => (
                    <MessageBubble
                      key={msg.id}
                      message={msg}
                      onRetry={onSend}
                      isLatest={idx === messages.length - 1}
                      isLoading={isLoading}
                      onSelectSlot={onSend}
                    />
                  ))}
                  {isLoading && <TypingIndicator />}
                  {dynamicPrompts.length > 0 && !isLoading && (
                    <SuggestedPrompts prompts={dynamicPrompts} onSelect={onSend} />
                  )}
                </>
              )}
              <div ref={scrollRef} />
            </div>
          </div>

          <VoiceStatusBar
            voiceMode={voiceMode}
            voiceState={voiceState}
            interimTranscript={interimTranscript}
            voiceError={voiceError}
            voiceNotice={voiceNotice}
            selectedVoiceName={selectedVoiceName}
            onDismissError={onDismissVoiceError}
            onPauseListening={onPauseListening}
            onResumeListening={onResumeListening}
            onStopSpeaking={onStopSpeaking}
            onTurnOffVoice={onToggleVoiceMode}
            onRetryVoice={onRetryVoice}
          />

          {/* Always-available text + mic composer */}
          <MessageInput
            onSend={onSend}
            disabled={isLoading || !conversationId}
            voiceMode={voiceMode}
            voiceState={voiceState}
            isListening={isListening}
            voiceSupported={voiceSupported}
            onVoiceButtonClick={onVoiceButtonClick}
            onPauseVoiceForTyping={onPauseListening}
          />
        </>
      )}
    </div>
  );
}
