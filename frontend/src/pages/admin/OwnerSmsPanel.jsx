import { useEffect, useState } from "react";
import { toast } from "sonner";
import { api } from "../../lib/api";
import { PhoneCall, Plus, Trash2, Save, Moon, Zap, ListChecks, AlertTriangle, DollarSign } from "lucide-react";

/**
 * OwnerSmsPanel — /admin/manage?tab=owner_sms
 *
 * Per-recipient SMS routing table. Each owner phone gets:
 *   • label
 *   • subscription list ("*" for everything, or a checked subset of kinds)
 *   • quiet_hours toggle (10pm-4am Nassau → morning digest at 5am)
 *
 * A "Flush digest now" button drains the queue on demand for smoke-testing.
 */
export default function OwnerSmsPanel() {
  const [rows, setRows] = useState([]);
  const [kinds, setKinds] = useState([]);
  const [priority, setPriority] = useState([]);
  const [meta, setMeta] = useState(null);
  const [saving, setSaving] = useState(false);
  const [savingPriority, setSavingPriority] = useState(false);
  const [flushing, setFlushing] = useState(false);
  const [pending, setPending] = useState(null);

  const load = async () => {
    try {
      const { data } = await api.get("/admin/owner-sms/recipients");
      setRows(data.recipients || []);
      setKinds(data.kinds || []);
      setPriority(data.priority_kinds || ["payment"]);
      setMeta({
        window: data.quiet_hours_window,
        digest_at: data.digest_delivery_local,
      });
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Load failed");
    }
    try {
      const { data } = await api.get("/admin/owner-sms/queue");
      setPending(data);
    } catch {
      // silent
    }
  };
  useEffect(() => { load(); }, []);

  const togglePriority = (kind) => {
    setPriority((p) => p.includes(kind) ? p.filter((k) => k !== kind) : [...p, kind]);
  };

  const savePriority = async () => {
    setSavingPriority(true);
    try {
      const { data } = await api.put("/admin/owner-sms/priority-kinds", { priority_kinds: priority });
      setPriority(data.priority_kinds || ["payment"]);
      toast.success("Priority override saved — payment always wakes you up 💰");
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Save failed");
    } finally {
      setSavingPriority(false);
    }
  };

  const updateRow = (idx, patch) => setRows((r) => r.map((row, i) => i === idx ? { ...row, ...patch } : row));

  const toggleSubscription = (idx, kind) => {
    const row = rows[idx];
    const subs = row.subscriptions || ["*"];
    // "*" toggles everything into an explicit list
    if (kind === "*") {
      updateRow(idx, { subscriptions: subs.includes("*") ? [] : ["*"] });
      return;
    }
    let next;
    if (subs.includes("*")) {
      next = kinds.filter((k) => k !== kind);
    } else if (subs.includes(kind)) {
      next = subs.filter((k) => k !== kind);
      if (next.length === 0) next = ["*"];
    } else {
      next = [...subs, kind];
    }
    updateRow(idx, { subscriptions: next });
  };

  const addRow = () => setRows((r) => [...r, { phone: "", label: "", subscriptions: ["*"], quiet_hours: true }]);
  const removeRow = (idx) => setRows((r) => r.filter((_, i) => i !== idx));

  const save = async () => {
    setSaving(true);
    try {
      const payload = { recipients: rows.map((r) => ({
        phone: r.phone.trim(),
        label: (r.label || "").trim(),
        subscriptions: r.subscriptions?.length ? r.subscriptions : ["*"],
        quiet_hours: !!r.quiet_hours,
      })) };
      const { data } = await api.put("/admin/owner-sms/recipients", payload);
      setRows(data.recipients || []);
      toast.success("SMS routing saved — live within a minute");
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const flushNow = async () => {
    setFlushing(true);
    try {
      await api.post("/admin/owner-sms/flush-digest-now");
      toast.success("Digest drained — every queued SMS was just fanned out");
      load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Flush failed");
    } finally {
      setFlushing(false);
    }
  };

  return (
    <div className="bg-white rounded-xl border border-[#E2E8F0] overflow-hidden" data-testid="owner-sms-panel">
      <div className="p-5 border-b border-[#E2E8F0]">
        <div className="flex items-center gap-2 text-[11px] uppercase tracking-[.18em] text-[#D4A94A] font-bold">
          <PhoneCall className="w-3 h-3" /> Owner SMS routing
        </div>
        <h2 className="mt-1 font-[Georgia] text-[#0B3B5C] text-2xl">Who gets pinged for what</h2>
        <p className="mt-1 text-sm text-[#64748B]">
          Add one row per owner phone. Pick what they want to hear about, and whether they want
          <strong> nighttime pings batched</strong> into the morning digest.
        </p>
        {meta && (
          <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
            <span className="inline-flex items-center gap-1 rounded bg-[#FBF7EF] text-[#0B3B5C] px-2 py-1 border border-[#E2E8F0]">
              <Moon className="w-3 h-3 text-[#D4A94A]" /> Quiet hours: {meta.window?.start_local}-{meta.window?.end_local} ({meta.window?.tz})
            </span>
            <span className="inline-flex items-center gap-1 rounded bg-[#FBF7EF] text-[#0B3B5C] px-2 py-1 border border-[#E2E8F0]">
              🌅 Digest fires at {meta.digest_at} Nassau
            </span>
            {pending && (
              <span className={`inline-flex items-center gap-1 rounded px-2 py-1 border font-semibold ${pending.pending > 0 ? "bg-[#FEF3C7] text-[#92400E] border-[#F5DFA1]" : "bg-[#F1F5F9] text-[#64748B] border-[#E2E8F0]"}`} data-testid="owner-sms-queue-badge">
                <ListChecks className="w-3 h-3" /> {pending.pending} queued
              </span>
            )}
          </div>
        )}
      </div>

      <div className="p-5 space-y-4">
        {/* ── High-Value auto-priority strip ── */}
        <HighValueThreshold />

        {/* ── Priority override strip — pinned at top so it's the first thing an admin sees ── */}
        <div className="rounded-lg border-2 border-[#DC2626]/30 bg-gradient-to-br from-[#FEF3C7] to-[#FFFFFF] p-4" data-testid="owner-sms-priority-card">
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-[.18em] text-[#DC2626] font-bold">
            <AlertTriangle className="w-3 h-3" /> Priority override
          </div>
          <p className="mt-1 text-[13px] text-[#0B3B5C]">
            These events <strong>always fan out live</strong> — they ignore quiet-hours and per-recipient preferences. Because money can wake you up 💰
          </p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {kinds.filter((k) => k !== "*").map((k) => {
              const on = priority.includes(k);
              return (
                <button
                  key={k}
                  type="button"
                  onClick={() => togglePriority(k)}
                  className={`px-2.5 py-1 rounded-full text-[11px] font-semibold border transition-colors ${on ? "bg-[#DC2626] text-white border-[#DC2626]" : "bg-white text-[#94a3b8] border-[#E2E8F0] hover:border-[#DC2626]"}`}
                  data-testid={`owner-sms-priority-${k}`}
                >
                  {on ? "🔔 " : ""}{k.replaceAll("_", " ")}
                </button>
              );
            })}
          </div>
          <div className="mt-3 flex items-center justify-between gap-2 flex-wrap">
            <span className="text-[11px] text-[#64748B]">Cleared list resets to <strong>payment</strong> so revenue alerts can't be silenced by accident.</span>
            <button
              onClick={savePriority}
              disabled={savingPriority}
              className="inline-flex items-center gap-1 rounded-md bg-[#DC2626] text-white text-[11px] font-bold px-3 py-1.5 hover:bg-[#B91C1C] disabled:opacity-60"
              data-testid="owner-sms-priority-save"
            >
              <Save className="w-3 h-3" /> {savingPriority ? "Saving…" : "Save priority list"}
            </button>
          </div>
        </div>

        {rows.length === 0 && (
          <div className="text-center py-8 text-[#64748B] text-sm">
            No recipients yet. Click <strong>Add owner phone</strong> below.
          </div>
        )}

        {rows.map((r, idx) => (
          <div key={idx} className="border border-[#E2E8F0] rounded-lg p-4 bg-[#FBF7EF]" data-testid={`owner-sms-row-${idx}`}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] uppercase tracking-wider text-[#64748B] font-bold">Phone (E.164)</label>
                <input
                  type="tel"
                  value={r.phone}
                  onChange={(e) => updateRow(idx, { phone: e.target.value })}
                  placeholder="+12424322587"
                  className="mt-1 w-full px-3 py-2 border border-[#E2E8F0] rounded-md text-sm font-mono"
                  data-testid={`owner-sms-phone-${idx}`}
                />
              </div>
              <div>
                <label className="text-[11px] uppercase tracking-wider text-[#64748B] font-bold">Label (for your own reference)</label>
                <input
                  type="text"
                  value={r.label || ""}
                  onChange={(e) => updateRow(idx, { label: e.target.value })}
                  placeholder="e.g. Rox owner cell"
                  className="mt-1 w-full px-3 py-2 border border-[#E2E8F0] rounded-md text-sm"
                  data-testid={`owner-sms-label-${idx}`}
                />
              </div>
            </div>

            <div className="mt-4">
              <label className="text-[11px] uppercase tracking-wider text-[#64748B] font-bold">Subscribed to</label>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => toggleSubscription(idx, "*")}
                  className={`px-2.5 py-1 rounded-full text-[11px] font-semibold border transition-colors ${(r.subscriptions || []).includes("*") ? "bg-[#0B3B5C] text-white border-[#0B3B5C]" : "bg-white text-[#64748B] border-[#E2E8F0] hover:border-[#0B3B5C]"}`}
                  data-testid={`owner-sms-sub-all-${idx}`}
                >
                  ⚡ Everything
                </button>
                {kinds.filter((k) => k !== "*").map((k) => {
                  const on = (r.subscriptions || []).includes("*") || (r.subscriptions || []).includes(k);
                  return (
                    <button
                      key={k}
                      type="button"
                      onClick={() => toggleSubscription(idx, k)}
                      className={`px-2.5 py-1 rounded-full text-[11px] font-semibold border transition-colors ${on ? "bg-[#D4A94A]/20 text-[#0B3B5C] border-[#D4A94A]" : "bg-white text-[#94a3b8] border-[#E2E8F0] hover:border-[#D4A94A]"}`}
                      data-testid={`owner-sms-sub-${k}-${idx}`}
                    >
                      {k.replaceAll("_", " ")}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="mt-4 flex items-center justify-between flex-wrap gap-3">
              <label className="inline-flex items-center gap-2 text-sm text-[#0B3B5C] font-semibold cursor-pointer">
                <input
                  type="checkbox"
                  checked={!!r.quiet_hours}
                  onChange={(e) => updateRow(idx, { quiet_hours: e.target.checked })}
                  className="w-4 h-4 accent-[#D4A94A]"
                  data-testid={`owner-sms-quiet-${idx}`}
                />
                <Moon className="w-4 h-4 text-[#D4A94A]" />
                Batch nighttime pings into 5am digest
              </label>
              <button
                type="button"
                onClick={() => removeRow(idx)}
                className="inline-flex items-center gap-1 text-xs text-[#DC2626] hover:text-red-800 font-semibold"
                data-testid={`owner-sms-remove-${idx}`}
              >
                <Trash2 className="w-3 h-3" /> Remove
              </button>
            </div>
          </div>
        ))}

        <button
          type="button"
          onClick={addRow}
          className="w-full py-3 rounded-lg border-2 border-dashed border-[#D4A94A] text-[#0B3B5C] hover:bg-[#FBF7EF] text-sm font-bold inline-flex items-center justify-center gap-2"
          data-testid="owner-sms-add-row"
        >
          <Plus className="w-4 h-4" /> Add owner phone
        </button>
      </div>

      <div className="p-4 border-t border-[#E2E8F0] flex flex-wrap items-center justify-between gap-3 bg-[#F8F5EC]">
        <button
          onClick={flushNow}
          disabled={flushing}
          className="inline-flex items-center gap-1.5 rounded-md bg-white text-[#0B3B5C] text-xs font-semibold px-3 py-2 border border-[#D4A94A] hover:bg-[#D4A94A]/10 disabled:opacity-60"
          data-testid="owner-sms-flush-digest"
          title="Bypass the 5am window and send all queued SMS right now"
        >
          <Zap className="w-3 h-3" /> {flushing ? "Flushing…" : "Flush digest now"}
        </button>
        <button
          onClick={save}
          disabled={saving}
          className="inline-flex items-center gap-1.5 rounded-md bg-[#0B3B5C] text-white text-xs font-semibold px-4 py-2 hover:bg-[#082941] disabled:opacity-60"
          data-testid="owner-sms-save"
        >
          <Save className="w-3 h-3" /> {saving ? "Saving…" : "Save routing"}
        </button>
      </div>
    </div>
  );
}

// ── High-value auto-priority editor ─────────────────────────────────────
function HighValueThreshold() {
  const [val, setVal] = useState(500);
  const [draft, setDraft] = useState("500");
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get("/admin/owner-sms/recipients");
        const t = Number(data.high_value_threshold_usd ?? 500);
        setVal(t);
        setDraft(String(t));
      } catch { /* silent */ }
      setLoaded(true);
    })();
  }, []);
  const save = async () => {
    const v = parseFloat(draft);
    if (Number.isNaN(v) || v < 0) { toast.error("Enter a positive dollar amount (or 0 to disable)"); return; }
    setSaving(true);
    try {
      const { data } = await api.put("/admin/owner-sms/high-value-threshold", { threshold_usd: v });
      setVal(data.threshold_usd);
      toast.success(v === 0 ? "High-value override disabled" : `Bookings ≥ $${v} will always wake you up 💎`);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Save failed");
    } finally {
      setSaving(false);
    }
  };
  if (!loaded) return null;
  return (
    <div className="rounded-lg border-2 border-[#0B3B5C]/20 bg-gradient-to-br from-[#0B3B5C] to-[#082941] text-white p-4" data-testid="high-value-threshold-card">
      <div className="flex items-center gap-2 text-[11px] uppercase tracking-[.18em] text-[#D4A94A] font-bold">
        <DollarSign className="w-3 h-3" /> High-value auto-priority
      </div>
      <p className="mt-1 text-[13px] text-white/85">
        Bookings <strong>at or above this amount</strong> auto-promote to priority — they break through quiet-hours even without <code>booking</code> in the priority list. Because big trips shouldn't sleep.
      </p>
      <div className="mt-3 flex items-center gap-2 flex-wrap">
        <div className="inline-flex items-center gap-1 bg-white rounded-md px-2 py-1.5 text-[#0B3B5C]">
          <span className="font-bold">$</span>
          <input
            type="number"
            min="0"
            step="25"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className="w-24 outline-none font-mono font-bold"
            data-testid="high-value-threshold-input"
          />
        </div>
        <button
          onClick={save}
          disabled={saving}
          className="inline-flex items-center gap-1 rounded-md bg-[#D4A94A] text-[#0B3B5C] text-[11px] font-bold px-3 py-2 hover:bg-[#B8912F] disabled:opacity-60"
          data-testid="high-value-threshold-save"
        >
          <Save className="w-3 h-3" /> {saving ? "Saving…" : "Save"}
        </button>
        {val > 0 ? (
          <span className="text-[11px] text-white/70">Currently active — bookings ≥ <strong className="text-[#D4A94A]">${val}</strong> will wake you.</span>
        ) : (
          <span className="text-[11px] text-white/70">Disabled — every booking respects your normal quiet-hours preference.</span>
        )}
      </div>
    </div>
  );
}
