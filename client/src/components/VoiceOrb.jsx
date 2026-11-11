/**
 * Reusable 5-state Voice Orb component (`off`, `listening`, `processing`, `speaking`, `error`)
 * with subtle waveform bars and accessible status semantics.
 * Used both as the hero voice showcase on WelcomeScreen and live compact call indicator in VoiceStatusBar.
 */
import { Mic, Volume2, Loader2, AlertTriangle } from 'lucide-react';

const ORB_THEMES = {
  off: {
    label: 'OFF',
    ariaLabel: 'Voice orb standby',
    outerRing: 'border-slate-700/80 bg-slate-800/40',
    core: 'from-slate-800 via-slate-800 to-slate-900 border-slate-600/70 text-slate-300 shadow-lg shadow-black/30',
    glow: 'from-blue-500/15 to-cyan-500/10',
  },
  listening: {
    label: 'LISTENING',
    ariaLabel: 'Voice orb listening',
    outerRing: 'border-red-500/50 bg-red-500/10',
    core: 'from-rose-500 via-red-500 to-orange-500 border-rose-300/50 text-white shadow-lg shadow-red-500/35',
    glow: 'from-red-500/30 to-rose-400/20',
  },
  processing: {
    label: 'PROCESSING',
    ariaLabel: 'Voice orb processing speech',
    outerRing: 'border-blue-400/50 bg-blue-500/10',
    core: 'from-blue-600 via-blue-500 to-indigo-500 border-blue-300/40 text-white shadow-lg shadow-blue-500/35',
    glow: 'from-blue-500/30 to-indigo-500/20',
  },
  speaking: {
    label: 'SPEAKING',
    ariaLabel: 'Voice orb speaking response',
    outerRing: 'border-cyan-400/55 bg-cyan-500/10',
    core: 'from-cyan-500 via-sky-500 to-blue-600 border-cyan-300/50 text-white animate-orb-speak',
    glow: 'from-cyan-400/35 to-blue-500/25',
  },
  error: {
    label: 'ERROR',
    ariaLabel: 'Voice orb error state',
    outerRing: 'border-amber-500/55 bg-amber-500/10',
    core: 'from-amber-600 via-red-600 to-rose-700 border-amber-300/50 text-white shadow-lg shadow-amber-500/25',
    glow: 'from-amber-500/25 to-red-500/20',
  },
};

function normalizeOrbState(voiceState) {
  if (voiceState === 'listening') return 'listening';
  if (voiceState === 'processing' || voiceState === 'requesting_permission') return 'processing';
  if (voiceState === 'speaking') return 'speaking';
  if (voiceState === 'error') return 'error';
  return 'off';
}

export default function VoiceOrb({
  state = 'off',
  size = 'md',
  onClick,
  title,
  disabled = false,
}) {
  const normalized = normalizeOrbState(state);
  const theme = ORB_THEMES[normalized];

  const dims =
    size === 'lg'
      ? { wrap: 'w-24 h-24', core: 'w-16 h-16', icon: 'w-7 h-7', barW: 'w-1', barH: 'h-6' }
      : size === 'sm'
      ? { wrap: 'w-10 h-10', core: 'w-8 h-8', icon: 'w-3.5 h-3.5', barW: 'w-0.5', barH: 'h-3.5' }
      : { wrap: 'w-14 h-14', core: 'w-11 h-11', icon: 'w-5 h-5', barW: 'w-0.5', barH: 'h-4' };

  const Tag = onClick ? 'button' : 'div';
  const interactionProps = onClick
    ? {
        type: 'button',
        onClick,
        disabled,
        'aria-label': title || theme.ariaLabel,
        title,
      }
    : { 'aria-label': theme.ariaLabel };

  return (
    <Tag
      data-orb-state={normalized}
      className={`relative inline-flex items-center justify-center rounded-full shrink-0 select-none ${dims.wrap} ${
        onClick ? 'cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/80' : ''
      }`}
      {...interactionProps}
    >
      {/* Subtle ambient glow */}
      <span
        aria-hidden="true"
        className={`absolute inset-0 rounded-full bg-gradient-to-br blur-md opacity-75 transition-opacity duration-300 ${theme.glow}`}
      />

      {/* Ripple ring on active listening / speaking */}
      {(normalized === 'listening' || normalized === 'speaking') && (
        <span
          aria-hidden="true"
          className={`absolute inset-0 rounded-full border ${
            normalized === 'listening' ? 'border-red-400/60' : 'border-cyan-400/60'
          } animate-orb-ripple`}
        />
      )}

      {/* Rotating ring on processing */}
      {normalized === 'processing' && (
        <span
          aria-hidden="true"
          className="absolute inset-0.5 rounded-full border-2 border-transparent border-t-cyan-300 border-r-blue-400 animate-spin"
        />
      )}

      {/* Outer orbital halo */}
      <span
        aria-hidden="true"
        className={`absolute inset-1 rounded-full border transition-colors duration-300 ${theme.outerRing} ${
          normalized === 'off' ? 'animate-orb-breathe' : ''
        }`}
      />

      {/* Core sphere */}
      <span
        className={`relative z-10 inline-flex items-center justify-center rounded-full bg-gradient-to-br border transition-all duration-300 ${dims.core} ${theme.core}`}
      >
        {normalized === 'listening' && (
          <span className="flex items-center justify-center gap-0.5" aria-hidden="true">
            <span className={`${dims.barW} ${dims.barH} bg-white/95 rounded-full voice-wave-bar`} />
            <span className={`${dims.barW} ${dims.barH} bg-white/95 rounded-full voice-wave-bar`} />
            <span className={`${dims.barW} ${dims.barH} bg-white rounded-full voice-wave-bar`} />
            <span className={`${dims.barW} ${dims.barH} bg-white/95 rounded-full voice-wave-bar`} />
            <span className={`${dims.barW} ${dims.barH} bg-white/95 rounded-full voice-wave-bar`} />
          </span>
        )}
        {normalized === 'processing' && <Loader2 className={`${dims.icon} animate-spin`} />}
        {normalized === 'speaking' && <Volume2 className={dims.icon} />}
        {normalized === 'error' && <AlertTriangle className={dims.icon} />}
        {normalized === 'off' && <Mic className={dims.icon} />}
      </span>
    </Tag>
  );
}

