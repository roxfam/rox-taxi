import { useMemo, useState } from "react";
import { Calendar as CalendarIcon, Clock } from "lucide-react";
import { format, parse, isValid } from "date-fns";
import { Calendar } from "./ui/calendar";
import { Popover, PopoverTrigger, PopoverContent } from "./ui/popover";

/**
 * DateTimePicker — shadcn Calendar + native time input.
 *
 * Value is an ISO-ish string ("YYYY-MM-DD" when includeTime=false, or
 * "YYYY-MM-DDTHH:mm" when true) so it drops in wherever a datetime-local
 * or date input was used.
 */
export function DateTimePicker({ value, onChange, includeTime = true, minDate, testid = "dt-picker", placeholder }) {
  const [open, setOpen] = useState(false);

  const parsed = useMemo(() => {
    if (!value) return null;
    // datetime-local strings ("2026-03-15T10:30") parse cleanly with new Date
    const d = new Date(value);
    return isValid(d) ? d : null;
  }, [value]);

  const dateOnly = parsed ? new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate()) : null;
  const timeString = parsed ? format(parsed, "HH:mm") : (includeTime ? "10:00" : "");

  const handleDate = (d) => {
    if (!d) {
      onChange("");
      return;
    }
    if (!includeTime) {
      onChange(format(d, "yyyy-MM-dd"));
      setOpen(false);
      return;
    }
    const [hh, mm] = timeString.split(":");
    const next = new Date(d);
    next.setHours(parseInt(hh || "10", 10), parseInt(mm || "0", 10), 0, 0);
    onChange(format(next, "yyyy-MM-dd'T'HH:mm"));
    setOpen(false);
  };

  const handleTime = (e) => {
    const t = e.target.value;
    const base = dateOnly || new Date();
    const [hh, mm] = t.split(":");
    const next = new Date(base);
    next.setHours(parseInt(hh || "0", 10), parseInt(mm || "0", 10), 0, 0);
    onChange(format(next, "yyyy-MM-dd'T'HH:mm"));
  };

  const label = parsed
    ? includeTime
      ? format(parsed, "EEE, MMM d yyyy · h:mm a")
      : format(parsed, "EEE, MMM d yyyy")
    : (placeholder || (includeTime ? "Pick a date & time" : "Pick a date"));

  return (
    <div className="flex gap-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            data-testid={`${testid}-trigger`}
            className={`flex-1 flex items-center gap-2 rounded-xl border bg-white px-4 py-3 text-sm text-left transition-colors ${parsed ? "border-[#E2E8F0] text-[#0B3B5C]" : "border-[#E2E8F0] text-[#94a3b8]"} hover:border-[#D4A94A] focus:outline-none focus:ring-2 focus:ring-[#D4A94A]/20`}
          >
            <CalendarIcon className="w-4 h-4 shrink-0 text-[#D4A94A]" />
            <span className="truncate">{label}</span>
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0 z-[110] bg-white border border-[#E2E8F0] rounded-xl shadow-xl" align="start" data-testid={`${testid}-popover`}>
          <Calendar
            mode="single"
            selected={dateOnly || undefined}
            onSelect={handleDate}
            initialFocus
            disabled={minDate ? { before: minDate } : { before: new Date(new Date().setHours(0, 0, 0, 0)) }}
          />
        </PopoverContent>
      </Popover>

      {includeTime && (
        <label className="relative flex items-center rounded-xl border border-[#E2E8F0] bg-white pl-3 pr-1 py-2 hover:border-[#D4A94A] focus-within:ring-2 focus-within:ring-[#D4A94A]/20 focus-within:border-[#D4A94A]" data-testid={`${testid}-time`}>
          <Clock className="w-4 h-4 text-[#D4A94A] mr-2" />
          <input
            type="time"
            value={timeString}
            onChange={handleTime}
            className="bg-transparent border-0 outline-none text-sm mono text-[#0B3B5C] w-24"
            data-testid={`${testid}-time-input`}
          />
        </label>
      )}
    </div>
  );
}

export default DateTimePicker;
