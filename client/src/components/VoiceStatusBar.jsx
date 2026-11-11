/**
 * Displays actionable microphone/browser error banners with recovery actions and
 * live Voice Mode call telemetry powered by the compact 5-state VoiceOrb component.
 */
import { MicOff, AlertTriangle, X, PhoneOff, Pause, Play, RefreshCw } from 'lucide-react';
import VoiceOrb from './VoiceOrb';

const STATE_CONFIG = {
  requesting_permission: {
    label: 'Requesting Mic Permission…',
    badgeClass: 'bg-amber-500/20 text-amber-300 border-amber-500/35',
    barClass: 'bg-[#111C30]/95 border-amber-500/30',
  },
  listening: {
    label: 'Listening…',
    badgeClass: 'bg-red-500/20 text-red-200 border-red-500/45',
    barClass: 'bg-red-500/10 border-red-500/30',
  },
  processing: {
    label: 'Processing…',
    badgeClass: 'bg-blue-500/20 text-blue-200 border-blue-500/45',
    barClass: 'bg-blue-500/10 border-blue-500/30',
  },
  speaking: {
    label: 'Speaking…',
    badgeClass: 'bg-cyan-500/20 text-cyan-200 border-cyan-500/45',
    barClass: 'bg-cyan-500/10 border-cyan-500/30',
  },
  error: {
    label: 'Voice Error',
    badgeClass: 'bg-amber-500/20 text-amber-200 border-amber-500/45',
    barClass: 'bg-amber-500/10 border-amber-500/35',
  },
  paused: {
    label: 'Mic Paused',
    badgeClass: 'bg-slate-700/80 text-slate-200 border-slate-600',
    barClass: 'bg-[#111C30]/95 border-slate-700',
  },
  off: {
    label: 'Voice Mode Off',
    badgeClass: 'bg-slate-800 text-slate-400 border-slate-700',
    barClass: 'bg-[#111C30]/95 border-slate-700',
  },
};

export default function VoiceStatusBar({
  voiceMode,
  voiceState,
  interimTranscript,
  voiceError,
  voiceNotice,
  selectedVoiceName,
  onDismissError,
  onResumeListening,
  onPauseListening,
  onStopSpeaking,
  onTurnOffVoice,
  onRetryVoice,
}) {
  if (!voiceMode && !voiceError) return null;

  const cfg = STATE_CONFIG[voiceState] || STATE_CONFIG.off;
  const orbState = voiceState === 'error' || (voiceError && !voiceMode) ? 'error' : voiceState;

  return (
    <div className="px-3 sm:px-4 md:px-6 pt-2.5 pb-1.5 bg-[#0B1220] border-t border-slate-800/90 space-y-2 shrink-0">
      {voiceError && (
        <div
          role="alert"
          className="max-w-3xl mx-auto flex items-center gap-2.5 px-3 py-2 rounded-xl bg-red-500/10 border border-red-500/30 text-xs sm:text-sm text-red-200"
        >
          {!voiceMode && (
            <VoiceOrb
              size="sm"
              state="error"
              onClick={onRetryVoice}
              title="Retry voice activation"
            />
          )}
          {voiceMode && <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />}
          <div className="flex-1 leading-relaxed min-w-0">{voiceError}</div>
          {onRetryVoice && (
            <button
              type="button"
              onClick={onRetryVoice}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 border border-amber-500/40 transition-colors shrink-0"
            >
              <RefreshCw className="w-3 h-3" />
              <span>Retry Mic</span>
            </button>
          )}
          {onDismissError && (
            <button
              type="button"
              onClick={onDismissError}
              aria-label="Dismiss voice error"
              className="text-red-300/80 hover:text-white p-1 rounded transition-colors shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      )}

      {voiceMode && (
        <div
          role="status"
          aria-live="polite"
          className={`max-w-3xl mx-auto rounded-xl border px-3 py-2 flex flex-wrap items-center justify-between gap-2 transition-colors ${cfg.barClass}`}
        >
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            <VoiceOrb size="sm" state={orbState} />

            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border shrink-0 ${cfg.badgeClass}`}>
              <span>{cfg.label}</span>
            </span>

            <div className="min-w-0 flex-1">
              {interimTranscript ? (
                <p className="text-xs sm:text-sm text-slate-100 truncate italic">
                  “{interimTranscript}”
                </p>
              ) : voiceNotice ? (
                <p className="text-xs text-amber-300/95 truncate">{voiceNotice}</p>
              ) : (
                <p className="text-xs text-slate-400 truncate">
                  {voiceState === 'listening' && 'Speak naturally — your turn sends automatically when you pause.'}
                  {voiceState === 'processing' && 'Processing your speech with Dasceq assistant…'}
                  {voiceState === 'speaking' &&
                    `Speaking${selectedVoiceName ? ` (${selectedVoiceName})` : ''}… Mic paused to prevent echo.`}
                  {voiceState === 'requesting_permission' &&
                    'Click "Allow" in your browser microphone prompt (or use Chrome/Edge site settings).'}
                  {voiceState === 'error' && 'Microphone interrupted — tap Retry Mic or continue typing below.'}
                  {voiceState === 'paused' && 'Tap Resume Mic to speak, or type your reply below.'}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {voiceState === 'listening' && onPauseListening && (
              <button
                type="button"
                onClick={onPauseListening}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-slate-700/90 hover:bg-slate-600 text-slate-100 transition-colors"
                title="Pause microphone temporarily"
              >
                <Pause className="w-3 h-3" />
                <span>Pause Mic</span>
              </button>
            )}

            {(voiceState === 'paused' || voiceState === 'error') && onResumeListening && (
              <button
                type="button"
                onClick={onResumeListening}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-emerald-600 hover:bg-emerald-500 text-white transition-colors"
              >
                <Play className="w-3 h-3" />
                <span>Resume Mic</span>
              </button>
            )}

            {voiceState === 'speaking' && onStopSpeaking && (
              <button
                type="button"
                onClick={() => onStopSpeaking({ resumeMic: true })}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-cyan-600/85 hover:bg-cyan-500 text-white transition-colors"
                title="Stop bot speech and respond now"
              >
                <MicOff className="w-3 h-3" />
                <span>Interrupt</span>
              </button>
            )}

            {onTurnOffVoice && (
              <button
                type="button"
                onClick={onTurnOffVoice}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-red-600/85 hover:bg-red-500 text-white transition-colors"
                title="Turn off two-way voice mode"
              >
                <PhoneOff className="w-3 h-3" />
                <span>Voice Off</span>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

