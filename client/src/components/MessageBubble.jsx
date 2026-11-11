import { Bot, User, AlertCircle, RefreshCw, Clock } from 'lucide-react';
import BookingCard from './BookingCard';
import { formatTime } from '../utils/helpers';

/**
 * Interactive Morning/Afternoon slot selector displaying all live available 30-min IST slots.
 */
function SlotPicker({ slots, onSelectSlot }) {
  if (!Array.isArray(slots) || slots.length === 0 || !onSelectSlot) return null;

  const morningSlots = slots.filter((s) => parseInt(String(s.time || '').split(':')[0], 10) < 12);
  const afternoonSlots = slots.filter((s) => parseInt(String(s.time || '').split(':')[0], 10) >= 12);

  const renderGroup = (title, items) => {
    if (items.length === 0) return null;
    return (
      <div className="space-y-1.5">
        <div className="text-[11px] font-medium uppercase tracking-wider text-slate-400 flex items-center gap-1">
          <Clock className="w-3 h-3 text-cyan-400" />
          <span>{title}</span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {items.map((slot) => (
            <button
              key={slot.time}
              type="button"
              onClick={() => onSelectSlot(slot.displayTime)}
              className="px-2.5 py-1 rounded-lg text-xs font-medium bg-[#18243B] hover:bg-blue-600/30 text-slate-200 hover:text-cyan-200 border border-slate-700/80 hover:border-cyan-400/50 transition-all active:scale-[0.97]"
            >
              {slot.displayTime}
            </button>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div
      role="group"
      aria-label="Available IST appointment slots"
      className="mt-2.5 p-3 rounded-2xl bg-[#111C30]/95 border border-slate-800 space-y-2.5 shadow-sm"
    >
      {renderGroup('Morning (IST)', morningSlots)}
      {renderGroup('Afternoon (IST)', afternoonSlots)}
    </div>
  );
}

/**
 * Safely render basic **bold** markdown segments without dangerouslySetInnerHTML.
 */
function FormattedText({ text }) {
  if (!text) return null;
  const parts = String(text).split(/(\*\*[^*]+\*\*)/g);
  return (
    <>
      {parts.map((part, idx) => {
        if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
          return (
            <strong key={idx} className="font-semibold text-white">
              {part.slice(2, -2)}
            </strong>
          );
        }
        return <span key={idx}>{part}</span>;
      })}
    </>
  );
}

export default function MessageBubble({
  message,
  onRetry,
  isLatest = false,
  isLoading = false,
  onSelectSlot,
}) {
  const isUser = message.role === 'user';

  // Error message
  if (message.isError) {
    return (
      <div className="flex gap-2.5 items-start animate-fadeInUp px-3 sm:px-5">
        <div className="w-8 h-8 rounded-full bg-red-500/20 border border-red-500/30 flex items-center justify-center shrink-0 mt-0.5">
          <AlertCircle className="w-4 h-4 text-red-400" />
        </div>
        <div className="max-w-[85%] sm:max-w-md">
          <div className="px-4 py-3 rounded-2xl rounded-bl-md bg-red-500/10 border border-red-500/25 space-y-2 shadow-sm">
            <p className="text-sm text-red-200 leading-relaxed">{message.errorText}</p>
            {message.retryText && onRetry && (
              <button
                type="button"
                onClick={() => onRetry(message.retryText)}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-red-100 hover:text-white bg-red-500/25 hover:bg-red-500/35 px-3 py-1.5 rounded-lg transition-colors"
              >
                <RefreshCw className="w-3 h-3" />
                Retry message
              </button>
            )}
          </div>
          <span className="text-[11px] text-slate-500 mt-1 block ml-1">
            {formatTime(message.timestamp)}
          </span>
        </div>
      </div>
    );
  }

  // Booking card
  if (message.isBooking && message.booking) {
    return (
      <div className="flex gap-2.5 items-start animate-fadeInUp px-3 sm:px-5">
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500/25 to-cyan-500/20 border border-blue-400/30 flex items-center justify-center shrink-0 mt-0.5">
          <Bot className="w-4 h-4 text-cyan-300" />
        </div>
        <div className="w-full max-w-[88%] sm:max-w-lg">
          {message.content && (
            <div className="px-4 py-3 rounded-2xl rounded-bl-md bg-[#111C30] border border-slate-800 mb-2.5 shadow-sm">
              <p className="text-[15px] leading-relaxed text-slate-200 whitespace-pre-wrap break-words">
                <FormattedText text={message.content} />
              </p>
            </div>
          )}
          <BookingCard booking={message.booking} />
          <span className="text-[11px] text-slate-500 mt-1 block ml-1">
            {formatTime(message.timestamp)}
          </span>
        </div>
      </div>
    );
  }

  // Regular message
  return (
    <div
      className={`flex gap-2.5 items-start animate-fadeInUp px-3 sm:px-5 ${
        isUser ? 'flex-row-reverse' : ''
      }`}
    >
      <div
        className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 mt-0.5 border ${
          isUser
            ? 'bg-blue-500/20 border-blue-400/30'
            : 'bg-gradient-to-br from-blue-500/25 to-cyan-500/20 border-blue-400/25'
        }`}
      >
        {isUser ? (
          <User className="w-4 h-4 text-blue-300" />
        ) : (
          <Bot className="w-4 h-4 text-cyan-300" />
        )}
      </div>
      <div className={`max-w-[85%] sm:max-w-md md:max-w-lg ${isUser ? 'text-right' : ''}`}>
        <div
          className={`inline-block text-left px-4 py-3 shadow-sm ${
            isUser
              ? 'bg-gradient-to-br from-blue-600 to-blue-500 text-white rounded-2xl rounded-br-md shadow-blue-950/30'
              : 'bg-[#111C30] border border-slate-800 text-slate-200 rounded-2xl rounded-bl-md'
          }`}
        >
          <p className="text-[15px] leading-relaxed whitespace-pre-wrap break-words">
            <FormattedText text={message.content} />
          </p>
        </div>
        {isLatest && !isLoading && !isUser && message.availableSlots?.length > 0 && (
          <SlotPicker slots={message.availableSlots} onSelectSlot={onSelectSlot} />
        )}
        <span
          className={`text-[11px] text-slate-500 mt-1 block ${
            isUser ? 'mr-1' : 'ml-1'
          }`}
        >
          {formatTime(message.timestamp)}
        </span>
      </div>
    </div>
  );
}
