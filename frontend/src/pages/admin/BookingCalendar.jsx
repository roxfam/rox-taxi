import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, CalendarDays } from "lucide-react";

const STATUS_COLOR = {
  confirmed: "bg-[#059669] text-white",
  completed: "bg-[#64748B] text-white",
  cancelled: "bg-[#FEE2E2] text-[#B91C1C] line-through",
};
const color = (s) => STATUS_COLOR[s] || "bg-[#D4A94A] text-white";
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const startOfWeek = (d) => addDays(d, -d.getDay());
const timeOf = (b) => (b.booking_date || "").slice(11, 16);

function rangeFor(view, cursor) {
  if (view === "day") return [new Date(cursor)];
  if (view === "week") { const s = startOfWeek(cursor); return [...Array(7)].map((_, i) => addDays(s, i)); }
  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const s = startOfWeek(first);
  return [...Array(42)].map((_, i) => addDays(s, i));
}

const Chip = ({ b, onOpen }) => (
  <button type="button" onClick={() => onOpen(b)} title={`${b.customer_name || ""} · ${b.item_name || b.service_type || ""}`}
    className={`w-full text-left text-[10px] leading-tight rounded px-1.5 py-1 truncate hover:opacity-80 transition-opacity ${color(b.status)}`}
    data-testid={`cal-booking-${b.id}`}>
    <span className="font-bold">{timeOf(b)}</span> {b.customer_name || b.id}
  </button>
);

function DayCell({ day, items, view, month, onOpen }) {
  const today = ymd(day) === ymd(new Date());
  const dim = view === "month" && day.getMonth() !== month;
  const max = view === "month" ? 3 : 50;
  return (
    <div className={`border border-[#E2E8F0] p-1.5 flex flex-col gap-1 ${view === "month" ? "min-h-[96px]" : "min-h-[220px]"} ${dim ? "bg-[#F8FAFC] opacity-60" : "bg-white"}`} data-testid={`cal-day-${ymd(day)}`}>
      <div className="flex items-center justify-between text-[11px]">
        <span className={`font-semibold ${today ? "bg-[#E86A3C] text-white rounded-full px-1.5" : "text-[#0B3B5C]"}`}>{view === "day" ? day.toDateString() : day.getDate()}</span>
        {items.length > 0 && <span className="text-[10px] text-[#64748B]" data-testid={`cal-count-${ymd(day)}`}>{items.length}</span>}
      </div>
      {items.slice(0, max).map((b) => <Chip key={b.id} b={b} onOpen={onOpen} />)}
      {items.length > max && <span className="text-[10px] text-[#64748B]">+{items.length - max} more</span>}
    </div>
  );
}

export default function BookingCalendar({ bookings, onOpen }) {
  const [view, setView] = useState("week");
  const [cursor, setCursor] = useState(() => new Date());
  const [showCancelled, setShowCancelled] = useState(false);
  const days = rangeFor(view, cursor);
  const byDay = useMemo(() => {
    const m = {};
    bookings.filter((b) => b.booking_date && (showCancelled || b.status !== "cancelled"))
      .forEach((b) => { const k = b.booking_date.slice(0, 10); (m[k] = m[k] || []).push(b); });
    Object.values(m).forEach((l) => l.sort((a, c) => timeOf(a).localeCompare(timeOf(c))));
    return m;
  }, [bookings, showCancelled]);
  const step = (dir) => setCursor((c) => view === "month" ? new Date(c.getFullYear(), c.getMonth() + dir, 1) : addDays(c, dir * (view === "week" ? 7 : 1)));
  const label = view === "month" ? cursor.toLocaleString(undefined, { month: "long", year: "numeric" })
    : view === "week" ? `${days[0].toLocaleDateString()} – ${days[6].toLocaleDateString()}` : cursor.toDateString();
  const btn = (on) => `text-xs px-3 py-1.5 rounded-md transition-colors ${on ? "bg-[#0B3B5C] text-white" : "hover:bg-[#F1F5F9]"}`;

  return (
    <div className="mt-8 bg-white rounded-xl border border-[#E2E8F0] overflow-hidden" data-testid="admin-booking-calendar">
      <div className="p-4 border-b border-[#E2E8F0] flex flex-wrap gap-2 items-center">
        <CalendarDays className="w-4 h-4 text-[#0B3B5C]" />
        <span className="font-semibold text-[#0B3B5C] text-sm mr-2">Booking calendar</span>
        {["day", "week", "month"].map((v) => (
          <button key={v} onClick={() => setView(v)} className={btn(view === v)} data-testid={`cal-view-${v}`}>{v[0].toUpperCase() + v.slice(1)}</button>
        ))}
        <span className="w-px h-5 bg-[#E2E8F0] mx-1" />
        <button onClick={() => step(-1)} className={btn(false)} aria-label="Previous" data-testid="cal-prev"><ChevronLeft className="w-4 h-4" /></button>
        <button onClick={() => setCursor(new Date())} className={btn(false)} data-testid="cal-today">Today</button>
        <button onClick={() => step(1)} className={btn(false)} aria-label="Next" data-testid="cal-next"><ChevronRight className="w-4 h-4" /></button>
        <span className="text-xs font-semibold text-[#0B3B5C]" data-testid="cal-range-label">{label}</span>
        <label className="ml-auto text-xs flex items-center gap-1.5 text-[#64748B] cursor-pointer">
          <input type="checkbox" checked={showCancelled} onChange={(e) => setShowCancelled(e.target.checked)} data-testid="cal-show-cancelled" />
          Show cancelled
        </label>
      </div>
      <div className="overflow-x-auto">
        <div className={`grid ${view === "day" ? "grid-cols-1" : "grid-cols-7 min-w-[700px]"}`}>
          {view !== "day" && ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
            <div key={d} className="text-[10px] uppercase tracking-widest text-[#64748B] text-center py-1.5 bg-[#F8FAFC]">{d}</div>
          ))}
          {days.map((d) => <DayCell key={ymd(d)} day={d} items={byDay[ymd(d)] || []} view={view} month={cursor.getMonth()} onOpen={onOpen} />)}
        </div>
      </div>
    </div>
  );
}
