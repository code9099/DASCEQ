/**
 * Executive confirmation/lookup receipt card rendering all verified appointment fields
 * (`bookingRef`, status, customer contact details, enquiry purpose, and IST date/time),
 * copyable reference, and calendar integration actions (Google Calendar + `.ics` download).
 */
import { useState } from 'react';
import {
  CheckCircle,
  XCircle,
  Calendar,
  Clock,
  Phone,
  Mail,
  User,
  FileText,
  Copy,
  Check,
  CalendarPlus,
  Download,
} from 'lucide-react';
import {
  formatDate,
  formatSlotTime,
  buildGoogleCalendarUrl,
  downloadBookingIcs,
} from '../utils/helpers';

export default function BookingCard({ booking }) {
  const [copied, setCopied] = useState(false);

  if (!booking) return null;

  const isCancelled = booking.status === 'cancelled';
  const displayDate = booking.displayDate || (booking.date ? formatDate(booking.date) : '');
  const displayTime = booking.displayTime || (booking.time ? formatSlotTime(booking.time) : '');
  const gcalUrl = !isCancelled ? buildGoogleCalendarUrl(booking) : null;

  const handleCopyRef = async () => {
    if (!booking.bookingRef || typeof navigator === 'undefined') return;
    try {
      await navigator.clipboard?.writeText(booking.bookingRef);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API unavailable in restricted contexts
    }
  };

  return (
    <div
      className={`animate-cardIn rounded-2xl border shadow-xl overflow-hidden ${
        isCancelled
          ? 'bg-gradient-to-b from-red-500/12 to-[#111C30] border-red-500/35'
          : 'bg-gradient-to-b from-emerald-500/12 to-[#111C30] border-emerald-500/35'
      }`}
    >
      {/* Header */}
      <div
        className={`flex items-center justify-between px-4 py-3 border-b ${
          isCancelled
            ? 'bg-red-500/10 border-red-500/20'
            : 'bg-emerald-500/10 border-emerald-500/20'
        }`}
      >
        <div className="flex items-center gap-2.5">
          {isCancelled ? (
            <XCircle className="w-5 h-5 text-red-400 animate-checkPop" />
          ) : (
            <CheckCircle className="w-5 h-5 text-emerald-400 animate-checkPop" />
          )}
          <span
            className={`text-sm font-semibold ${
              isCancelled ? 'text-red-300' : 'text-emerald-300'
            }`}
          >
            {isCancelled ? 'Appointment Cancelled' : 'Appointment Confirmed'}
          </span>
        </div>
        <span
          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${
            isCancelled
              ? 'bg-red-500/20 text-red-300 border border-red-500/30'
              : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
          }`}
        >
          {isCancelled ? 'Cancelled' : 'Confirmed'}
        </span>
      </div>

      {/* Details */}
      <div className="px-4 py-3.5 space-y-2.5">
        {booking.bookingRef && (
          <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-800/80">
            <span className="text-[11px] uppercase tracking-wider text-slate-400 font-medium">
              Reference
            </span>
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-bold tracking-wider font-mono text-cyan-300 bg-cyan-500/10 border border-cyan-500/30 px-2.5 py-0.5 rounded-md">
                {booking.bookingRef}
              </span>
              <button
                type="button"
                onClick={handleCopyRef}
                aria-label="Copy booking reference"
                title="Copy booking reference"
                className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium text-slate-300 hover:text-white bg-slate-800/80 hover:bg-slate-700/90 border border-slate-700 transition-colors"
              >
                {copied ? (
                  <>
                    <Check className="w-3 h-3 text-emerald-400" />
                    <span className="text-emerald-300">Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3 h-3" />
                    <span className="hidden sm:inline">Copy</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {booking.customerInfo?.name && (
            <div className="flex items-center gap-2 min-w-0">
              <User className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <span className="text-[11px] text-slate-400 shrink-0">Name:</span>
              <span className="text-sm text-slate-100 font-medium break-words truncate">
                {booking.customerInfo.name}
              </span>
            </div>
          )}

          {booking.customerInfo?.phone && (
            <div className="flex items-center gap-2 min-w-0">
              <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <span className="text-[11px] text-slate-400 shrink-0">Phone:</span>
              <span className="text-sm text-slate-100 font-medium">{booking.customerInfo.phone}</span>
            </div>
          )}
        </div>

        {booking.customerInfo?.email && (
          <div className="flex items-center gap-2 min-w-0">
            <Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <span className="text-[11px] text-slate-400 w-14 shrink-0">Email</span>
            <span className="text-sm text-slate-100 break-all">{booking.customerInfo.email}</span>
          </div>
        )}

        {booking.customerInfo?.enquiryPurpose && (
          <div className="flex items-start gap-2">
            <FileText className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
            <span className="text-[11px] text-slate-400 w-14 shrink-0 mt-0.5">Purpose</span>
            <span className="text-sm text-slate-100 break-words">
              {booking.customerInfo.enquiryPurpose}
            </span>
          </div>
        )}

        {(displayDate || displayTime) && (
          <div
            className={`flex flex-wrap items-center gap-x-4 gap-y-2 pt-2.5 mt-1 border-t ${
              isCancelled ? 'border-red-500/20' : 'border-emerald-500/20'
            }`}
          >
            {displayDate && (
              <div className="flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span className="text-sm font-medium text-slate-100">{displayDate}</span>
              </div>
            )}
            {displayTime && (
              <div className="flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span className="text-sm font-medium text-slate-100">{displayTime} IST</span>
              </div>
            )}
          </div>
        )}

        {/* Calendar integration actions */}
        {gcalUrl && (
          <div className="flex flex-wrap items-center gap-2 pt-2.5 border-t border-emerald-500/15">
            <a
              href={gcalUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-200 border border-emerald-500/35 transition-colors"
            >
              <CalendarPlus className="w-3.5 h-3.5 text-emerald-300 shrink-0" />
              <span>Add to Google Calendar</span>
            </a>
            <button
              type="button"
              onClick={() => downloadBookingIcs(booking)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-[#18243B] hover:bg-slate-700/80 text-slate-200 border border-slate-700/80 transition-colors"
            >
              <Download className="w-3.5 h-3.5 text-cyan-300 shrink-0" />
              <span>Download .ics</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
