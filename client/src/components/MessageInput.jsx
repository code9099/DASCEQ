/**
 * Always-available composer allowing seamless switching between typing and Voice Mode.
 * Pauses active microphone recognition as soon as the user begins typing and auto-resizes up to 112px.
 */
import { useState, useRef } from 'react';
import { Send } from 'lucide-react';
import VoiceButton from './VoiceButton';

export default function MessageInput({
  onSend,
  disabled,
  voiceMode = false,
  voiceState = 'off',
  isListening = false,
  voiceSupported = true,
  onVoiceButtonClick,
  onPauseVoiceForTyping,
}) {
  const [text, setText] = useState('');
  const textareaRef = useRef(null);

  const resizeTextarea = (el) => {
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 112)}px`;
  };

  const handleChange = (e) => {
    const val = e.target.value;
    setText(val);
    resizeTextarea(e.target);
    if (val.length > 0 && voiceMode && voiceState === 'listening' && onPauseVoiceForTyping) {
      onPauseVoiceForTyping();
    }
  };

  const handleSend = () => {
    if (!text.trim() || disabled) return;
    onSend(text.trim());
    setText('');
    if (textareaRef.current) {
      textareaRef.current.style.height = '44px';
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="px-3 sm:px-4 py-3 bg-[#0B1220] border-t border-slate-800/90 shrink-0">
      <div className="flex items-end gap-2 max-w-3xl mx-auto">
        <div className="flex-1 flex items-end bg-[#111C30] rounded-xl border border-slate-700/80 focus-within:border-blue-500/80 focus-within:ring-1 focus-within:ring-blue-500/30 transition-all">
          <textarea
            ref={textareaRef}
            value={text}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            placeholder={
              voiceState === 'listening'
                ? 'Listening… or type your message here'
                : 'Type your message…'
            }
            disabled={disabled}
            rows={1}
            className="flex-1 bg-transparent text-slate-100 placeholder-slate-500 text-[15px] px-4 py-2.5 resize-none outline-none max-h-28 border-none focus:ring-0"
            style={{ minHeight: '44px' }}
          />
        </div>

        <VoiceButton
          voiceMode={voiceMode}
          isListening={isListening}
          voiceSupported={voiceSupported}
          onClick={onVoiceButtonClick}
          disabled={disabled}
        />

        <button
          type="button"
          onClick={handleSend}
          disabled={disabled || !text.trim()}
          aria-label="Send message"
          className="w-11 h-11 flex items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 disabled:opacity-40 disabled:cursor-not-allowed transition-all active:scale-[0.97] shrink-0 shadow-sm shadow-blue-950/40"
        >
          <Send className="w-5 h-5 text-white" />
        </button>
      </div>
    </div>
  );
}
