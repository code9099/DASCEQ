import { Bot } from 'lucide-react';

export default function TypingIndicator() {
  return (
    <div className="flex gap-2.5 items-start animate-fadeInUp px-3 sm:px-5">
      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500/25 to-cyan-500/20 border border-blue-400/25 flex items-center justify-center shrink-0 mt-0.5">
        <Bot className="w-4 h-4 text-cyan-300" />
      </div>
      <div className="px-4 py-3.5 rounded-2xl rounded-bl-md bg-[#111C30] border border-slate-800 shadow-sm">
        <div className="flex items-center gap-1.5">
          <span className="typing-dot w-2 h-2 bg-cyan-400/80 rounded-full inline-block" />
          <span className="typing-dot w-2 h-2 bg-blue-400/80 rounded-full inline-block" />
          <span className="typing-dot w-2 h-2 bg-cyan-400/80 rounded-full inline-block" />
        </div>
      </div>
    </div>
  );
}
