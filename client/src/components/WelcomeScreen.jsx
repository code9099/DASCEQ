/**
 * Commercial SaaS landing view for Dasceq AI Concierge featuring an interactive Voice Orb showcase,
 * primary Text & Voice launch actions, and quick-action capability cards.
 */
import {
  MessageSquare,
  Calendar,
  HelpCircle,
  Compass,
  ChevronRight,
  PhoneCall,
  ShieldCheck,
  Clock,
} from 'lucide-react';
import VoiceOrb from './VoiceOrb';

const PROMPTS = [
  {
    icon: Calendar,
    label: 'Schedule an appointment',
    caption: 'Book a verified 30-min IST slot',
    color: 'text-blue-400',
  },
  {
    icon: Compass,
    label: 'Explore Dasceq services',
    caption: 'How we can help & booking hours',
    color: 'text-cyan-400',
  },
  {
    icon: MessageSquare,
    label: 'Product enquiry',
    caption: 'Share requirements & explore fit',
    color: 'text-indigo-400',
  },
  {
    icon: HelpCircle,
    label: 'General support',
    caption: 'Get assistance or check booking status',
    color: 'text-emerald-400',
  },
];

export default function WelcomeScreen({
  onStart,
  onStartVoice,
  onPrompt,
  isLoading,
  voiceSupported = true,
  voiceMode = false,
  voiceState = 'off',
  voiceError = null,
}) {
  const heroOrbState = voiceError ? 'error' : voiceMode ? voiceState : 'off';

  return (
    <div className="relative flex-1 min-h-0 overflow-y-auto flex flex-col items-center justify-center px-4 py-8 sm:py-10 animate-fadeInUp">
      {/* Subtle architectural radial glow */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute top-12 left-1/2 -translate-x-1/2 w-[360px] sm:w-[540px] h-[220px] rounded-full bg-gradient-to-r from-blue-600/15 via-cyan-500/10 to-indigo-500/15 blur-3xl"
      />

      <div className="relative z-10 w-full max-w-2xl flex flex-col items-center text-center">
        {/* Interactive Voice Orb preview */}
        <div className="mb-5">
          <VoiceOrb
            size="lg"
            state={heroOrbState}
            onClick={onStartVoice}
            disabled={isLoading}
            title={
              voiceSupported
                ? 'Start two-way voice conversation'
                : 'Voice mode unavailable in this browser (click for details)'
            }
          />
        </div>

        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-medium bg-blue-500/10 text-cyan-300 border border-blue-500/25 mb-3">
          <ShieldCheck className="w-3.5 h-3.5 text-cyan-400" />
          Dasceq AI Receptionist · IST Verified Scheduling
        </span>

        <h2 className="text-2xl sm:text-3xl md:text-4xl font-semibold tracking-tight text-slate-50 mb-3">
          AI Customer Assistant
        </h2>
        <p className="text-slate-400 text-sm sm:text-base mb-7 max-w-lg leading-relaxed">
          Explore Dasceq services, share your project enquiry, or book a verified consultation slot — seamlessly by text or two-way voice.
        </p>

        {/* Primary Launch CTAs */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mb-8 w-full max-w-md">
          <button
            type="button"
            onClick={onStart}
            disabled={isLoading}
            className="w-full sm:w-auto px-7 py-3 bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 disabled:opacity-60 disabled:cursor-not-allowed text-white font-medium rounded-xl transition-all shadow-lg shadow-blue-600/25 active:scale-[0.99]"
          >
            {isLoading ? 'Starting…' : 'Start Conversation'}
          </button>

          {onStartVoice && (
            <button
              type="button"
              onClick={onStartVoice}
              disabled={isLoading}
              className={`w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3 font-medium rounded-xl border transition-all active:scale-[0.99] ${
                voiceSupported
                  ? 'bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border-emerald-500/40'
                  : 'bg-[#111C30] hover:bg-[#18243B] text-slate-300 border-slate-700'
              }`}
            >
              <PhoneCall className="w-4 h-4" />
              <span>Start Voice Call</span>
            </button>
          )}
        </div>

        {/* Capability Prompt Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-xl">
          {PROMPTS.map(({ icon: Icon, label, caption, color }) => (
            <button
              key={label}
              type="button"
              onClick={() => onPrompt(label)}
              disabled={isLoading}
              className="flex items-center gap-3 bg-[#111C30]/90 hover:bg-[#18243B] border border-slate-800 hover:border-blue-500/40 rounded-xl px-4 py-3.5 text-left transition-all group disabled:opacity-50"
            >
              <div className="w-9 h-9 rounded-lg bg-slate-900/80 border border-slate-800 flex items-center justify-center shrink-0">
                <Icon className={`w-4.5 h-4.5 ${color}`} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-slate-200 group-hover:text-white transition-colors truncate">
                  {label}
                </div>
                <div className="text-xs text-slate-400 truncate">{caption}</div>
              </div>
              <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-cyan-300 group-hover:translate-x-0.5 transition-all shrink-0" />
            </button>
          ))}
        </div>

        {/* Working hours & browser voice notice */}
        <div className="mt-6 flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 text-[11px] text-slate-500">
          <span className="inline-flex items-center gap-1">
            <Clock className="w-3 h-3 text-slate-400" />
            Booking slots: Mon–Fri, 9:00 AM – 6:00 PM IST
          </span>
          <span>·</span>
          <span>
            {voiceSupported
              ? 'Voice Mode uses Chrome/Edge browser speech (opt-in mic)'
              : 'Voice Mode unavailable in this browser — use Chrome or Edge (text chat works normally)'}
          </span>
        </div>
      </div>
    </div>
  );
}
