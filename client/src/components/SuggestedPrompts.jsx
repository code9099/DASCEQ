export default function SuggestedPrompts({ prompts, onSelect }) {
  if (!prompts || prompts.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2 px-3 sm:px-5 pb-2 animate-fadeInUp">
      {prompts.map((prompt) => (
        <button
          key={prompt}
          type="button"
          onClick={() => onSelect(prompt)}
          className="px-3.5 py-1.5 bg-[#111C30] hover:bg-blue-500/20 text-slate-200 hover:text-cyan-300 rounded-full text-xs sm:text-sm font-medium transition-all border border-slate-700/80 hover:border-blue-500/50 active:scale-[0.98]"
        >
          {prompt}
        </button>
      ))}
    </div>
  );
}
