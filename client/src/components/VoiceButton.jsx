import { Mic, MicOff } from 'lucide-react';

export default function VoiceButton({
  voiceMode = false,
  isListening = false,
  voiceSupported = true,
  onClick,
  disabled,
}) {
  const isUnsupported = !voiceSupported;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled && !isUnsupported}
      aria-label={
        isUnsupported
          ? 'Voice not supported in this browser'
          : isListening
          ? 'Stop voice listening'
          : voiceMode
          ? 'Resume voice listening'
          : 'Start two-way voice mode'
      }
      title={
        isUnsupported
          ? 'Voice requires Chrome or Edge — click for details'
          : isListening
          ? 'Stop voice mode'
          : voiceMode
          ? 'Voice mode active — click to pause/stop'
          : 'Activate two-way Voice Mode'
      }
      className={`w-11 h-11 flex items-center justify-center rounded-xl transition-all active:scale-[0.97] shrink-0 ${
        isUnsupported
          ? 'bg-[#111C30] text-slate-400 hover:bg-[#18243B] border border-slate-700/80'
          : isListening
          ? 'bg-red-500 hover:bg-red-600 text-white animate-pulse-ring'
          : voiceMode
          ? 'bg-cyan-600 hover:bg-cyan-500 text-white border border-cyan-400/30'
          : 'bg-[#111C30] hover:bg-[#18243B] text-slate-200 border border-slate-700/80'
      } disabled:opacity-40 disabled:cursor-not-allowed`}
    >
      {isListening ? (
        <MicOff className="w-5 h-5" />
      ) : (
        <Mic className="w-5 h-5" />
      )}
    </button>
  );
}
