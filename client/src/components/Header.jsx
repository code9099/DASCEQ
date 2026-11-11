/**
 * Persistent executive header bar displaying Dasceq brand identity, live backend connection pill,
 * Voice Mode state toggle (including Error / Listening / Processing / Speaking / Off), and New Chat control.
 */
import { Bot, Sparkles, RotateCcw, PhoneCall, PhoneOff, Volume2, Loader2, Mic, AlertTriangle } from 'lucide-react';

const VOICE_BADGE = {
  listening: { label: 'Listening', icon: Mic, style: 'bg-red-500/20 text-red-200 border-red-500/50 hover:bg-red-500/30' },
  processing: { label: 'Processing', icon: Loader2, spin: true, style: 'bg-blue-500/20 text-blue-200 border-blue-500/50 hover:bg-blue-500/30' },
  speaking: { label: 'Speaking', icon: Volume2, style: 'bg-cyan-500/20 text-cyan-200 border-cyan-500/50 hover:bg-cyan-500/30' },
  error: { label: 'Voice Error', icon: AlertTriangle, style: 'bg-amber-500/20 text-amber-200 border-amber-500/50 hover:bg-amber-500/30' },
  paused: { label: 'Voice On', icon: PhoneCall, style: 'bg-emerald-500/20 text-emerald-200 border-emerald-500/40 hover:bg-emerald-500/30' },
  requesting_permission: { label: 'Mic Access…', icon: Loader2, spin: true, style: 'bg-amber-500/20 text-amber-200 border-amber-500/40' },
};

export default function Header({
  connectionStatus = 'checking',
  aiProvider = null,
  aiStatus = null,
  hasStarted = false,
  onReset,
  voiceMode = false,
  voiceState = 'off',
  voiceSupported = true,
  onToggleVoiceMode,
}) {
  const isDemoFallback = aiProvider === 'demo' && aiStatus === 'fallback';
  const connectedLabel =
    aiProvider === 'gemini'
      ? aiStatus === 'live'
        ? 'Gemini AI · Connected'
        : 'Gemini Ready · Connected'
      : isDemoFallback
      ? 'Demo Fallback · Connected'
      : aiProvider === 'demo'
      ? 'Demo Mode · Connected'
      : 'Connected';

  const statusConfig = {
    connected: {
      dot: isDemoFallback ? 'bg-amber-400' : 'bg-emerald-400',
      ping: !isDemoFallback,
      label: connectedLabel,
      text: isDemoFallback ? 'text-amber-200' : 'text-slate-300',
      pill: isDemoFallback
        ? 'bg-amber-500/10 border-amber-500/30'
        : 'bg-emerald-500/10 border-emerald-500/25',
    },
    checking: {
      dot: 'bg-amber-400 animate-pulse',
      ping: false,
      label: 'Connecting…',
      text: 'text-amber-300',
      pill: 'bg-amber-500/10 border-amber-500/25',
    },
    disconnected: {
      dot: 'bg-red-500',
      ping: false,
      label: 'Server Offline',
      text: 'text-red-300',
      pill: 'bg-red-500/10 border-red-500/25',
    },
  };

  const status = statusConfig[connectionStatus] || statusConfig.checking;
  const activeVoice = voiceMode ? VOICE_BADGE[voiceState] || VOICE_BADGE.paused : null;
  const VoiceIcon = activeVoice ? activeVoice.icon : PhoneOff;

  return (
    <header className="h-16 flex items-center justify-between px-3 sm:px-5 md:px-6 bg-[#0B1220]/95 backdrop-blur-md border-b border-slate-800/90 shrink-0 gap-2 z-20">
      <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500/25 to-cyan-500/20 border border-blue-400/30 flex items-center justify-center shrink-0 shadow-sm shadow-blue-950/50">
          <Bot className="w-5 h-5 text-cyan-300" />
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-base font-semibold tracking-tight text-slate-100 leading-tight truncate">
              Dasceq
            </h1>
          </div>
          <span className="text-[11px] text-cyan-400/95 font-medium flex items-center gap-1 truncate">
            <Sparkles className="w-3 h-3 shrink-0" />
            <span className="truncate">Intelligent Customer Experience</span>
          </span>
        </div>
      </div>

      <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
        {onToggleVoiceMode && (
          <button
            type="button"
            onClick={onToggleVoiceMode}
            aria-pressed={voiceMode}
            aria-label={voiceMode ? 'Turn Voice Mode Off' : 'Turn Voice Mode On'}
            title={
              !voiceSupported
                ? 'Voice Mode requires Chrome or Edge (click for details)'
                : voiceMode
                ? 'Voice Mode is ON — click to turn OFF'
                : 'Turn ON Two-Way Voice Mode'
            }
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-all active:scale-[0.98] ${
              !voiceSupported
                ? 'bg-slate-800/80 text-slate-400 border-slate-700 hover:text-slate-200'
                : voiceMode && activeVoice
                ? activeVoice.style
                : 'bg-[#111C30] hover:bg-[#18243B] text-slate-200 hover:text-white border-slate-700/80'
            }`}
          >
            <VoiceIcon className={`w-3.5 h-3.5 ${activeVoice?.spin ? 'animate-spin' : ''}`} />
            <span>
              {!voiceSupported
                ? 'Voice Unsupported'
                : voiceMode && activeVoice
                ? activeVoice.label
                : 'Voice Mode Off'}
            </span>
          </button>
        )}

        {hasStarted && onReset && (
          <button
            type="button"
            onClick={onReset}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-200 hover:text-white bg-[#111C30] hover:bg-[#18243B] border border-slate-700/80 transition-all active:scale-[0.98]"
            title="Start a new conversation"
            aria-label="New Chat"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">New Chat</span>
          </button>
        )}

        <div
          className={`flex items-center gap-1.5 px-2 py-1 rounded-full border ${status.pill}`}
          title={status.label}
        >
          <span className="relative flex h-2 w-2">
            {status.ping && (
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60" />
            )}
            <span className={`relative inline-flex rounded-full h-2 w-2 ${status.dot}`} />
          </span>
          <span className={`text-[11px] font-medium hidden md:inline ${status.text}`}>{status.label}</span>
        </div>
      </div>
    </header>
  );
}
