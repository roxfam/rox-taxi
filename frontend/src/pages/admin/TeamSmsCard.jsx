import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Users, Plus, Trash2, Save, Moon, Power } from "lucide-react";
import { api } from "../../lib/api";

// Stringify an axios error payload safely — FastAPI returns Pydantic
// validation errors as an array of `{type,loc,msg,...}` objects which
// sonner can't render as a React child. We flatten to a readable string.
const errText = (e, fallback = "Request failed") => {
  const d = e?.response?.data?.detail;
  if (typeof d === "string") return d;
  if (Array.isArray(d)) return d.map((x) => x?.msg || JSON.stringify(x)).join("; ");
  if (d && typeof d === "object") return d.msg || JSON.stringify(d);
  return fallback;
};

/**
 * TeamSmsCard — admin control for `site_config.team_sms_recipients`.
 *
 * Separate from the Owner SMS roster. Lets each ground team (beach crew,
 * taxi dispatch, tour guides, car-rental agents, group coordinators)
 * subscribe only to the service areas they handle. Admin numbers continue
 * to receive EVERY event through the Owner SMS panel.
 */
export default function TeamSmsCard() {
  const [rows, setRows] = useState([]);
  const [areas, setAreas] = useState([]);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    try {
      const { data } = await api.get("/notifications/team-sms");
      setRows(data.recipients || []);
      setAreas(data.areas || []);
    } catch (e) {
      // 401 just means the card mounted before admin login — no toast.
      if (e?.response?.status === 401) return;
      toast.error(errText(e, "Load failed"));
    }
  };
  useEffect(() => { load(); }, []);

  const update = (idx, patch) => setRows((r) =>
    r.map((row, i) => (i === idx ? { ...row, ...patch } : row)));
  const toggleArea = (idx, areaId) => setRows((r) =>
    r.map((row, i) => {
      if (i !== idx) return row;
      const cur = new Set(row.areas || []);
      cur.has(areaId) ? cur.delete(areaId) : cur.add(areaId);
      return { ...row, areas: Array.from(cur) };
    }));
  const addRow = () => setRows((r) => [...r, {
    id: "", label: "", phone: "+1", email: "", areas: [], enabled: true, quiet_hours: false,
  }]);
  const removeRow = (idx) => setRows((r) => r.filter((_, i) => i !== idx));

  const save = async () => {
    for (const r of rows) {
      if (r.phone && !r.phone.startsWith("+")) {
        toast.error(`Phone for "${r.label || "(no label)"}" must start with + (E.164)`);
        return;
      }
      if (r.email && !r.email.includes("@")) {
        toast.error(`Email for "${r.label || "(no label)"}" looks invalid`);
        return;
      }
      if (!r.phone && !r.email) {
        toast.error(`"${r.label || "(no label)"}" needs a phone or email to receive alerts`);
        return;
      }
    }
    setSaving(true);
    try {
      const { data } = await api.put("/notifications/team-sms", { recipients: rows });
      setRows(data.recipients || []);
      toast.success("Team SMS roster saved");
    } catch (e) {
      toast.error(errText(e, "Save failed"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="mt-8 rounded-2xl bg-white border border-[#E2E8F0] p-5" data-testid="team-sms-card">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#D4A94A]/10 flex items-center justify-center text-[#D4A94A]">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <div className="text-sm font-bold text-[#0B3B5C]">Team SMS routing</div>
            <div className="text-xs text-[#64748B] mt-0.5">
              Area-specific numbers. Beach crew, taxi dispatch, tour guides etc.
              Owner numbers get everything from the <a href="/admin/manage?tab=owner_sms" className="underline">Owner SMS panel</a>.
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={addRow}
            className="inline-flex items-center gap-1 text-xs text-[#0B3B5C] border border-[#E2E8F0] bg-white rounded-full px-2.5 py-1.5 hover:border-[#D4A94A]"
            data-testid="team-sms-add">
            <Plus className="w-3 h-3" /> Add team
          </button>
          <button onClick={save} disabled={saving}
            className="inline-flex items-center gap-1 text-xs text-white bg-[#0B3B5C] rounded-full px-3 py-1.5 hover:bg-[#0a2a44] disabled:opacity-50"
            data-testid="team-sms-save">
            <Save className="w-3 h-3" /> Save roster
          </button>
        </div>
      </div>

      <div className="mt-4 space-y-3">
        {rows.length === 0 ? (
          <div className="text-xs text-[#94A3B8] italic py-6 text-center border border-dashed border-[#E2E8F0] rounded-xl" data-testid="team-sms-empty">
            No team numbers yet — click <b>Add team</b> to route Cable Beach / taxi / tour SMS alerts to a ground crew.
          </div>
        ) : rows.map((row, i) => (
          <div key={row.id || `new-${i}`} className="rounded-xl border border-[#E2E8F0] p-3.5" data-testid={`team-sms-row-${i}`}>
            <div className="grid sm:grid-cols-[1fr_200px_240px_auto_auto_auto] gap-2 items-center">
              <input value={row.label} placeholder="e.g. Cable Beach beach team"
                onChange={(e) => update(i, { label: e.target.value })}
                className="text-sm bg-white border border-[#E2E8F0] rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-[#D4A94A]"
                data-testid={`team-sms-label-${i}`} />
              <input value={row.phone || ""} placeholder="+1242…"
                onChange={(e) => update(i, { phone: e.target.value })}
                className="text-sm font-mono bg-white border border-[#E2E8F0] rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-[#D4A94A]"
                data-testid={`team-sms-phone-${i}`} />
              <input value={row.email || ""} placeholder="team@example.com"
                onChange={(e) => update(i, { email: e.target.value })}
                className="text-sm bg-white border border-[#E2E8F0] rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-[#D4A94A]"
                data-testid={`team-sms-email-${i}`} />
              <button onClick={() => update(i, { quiet_hours: !row.quiet_hours })}
                title="Suppress 22:00-04:00 Nassau"
                data-testid={`team-sms-quiet-${i}`}
                className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1.5 text-[10px] font-black uppercase tracking-wider transition ${row.quiet_hours ? "bg-indigo-100 text-indigo-700" : "border border-[#E2E8F0] text-[#64748B] hover:border-indigo-300"}`}>
                <Moon className="w-3 h-3" /> Quiet
              </button>
              <button onClick={() => update(i, { enabled: !row.enabled })}
                data-testid={`team-sms-enabled-${i}`}
                className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1.5 text-[10px] font-black uppercase tracking-wider ${row.enabled ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-500"}`}>
                <Power className="w-3 h-3" /> {row.enabled ? "On" : "Off"}
              </button>
              <button onClick={() => removeRow(i)}
                className="w-9 h-9 rounded-lg border border-[#FECACA] bg-white text-[#B91C1C] hover:bg-[#FEF2F2] flex items-center justify-center"
                data-testid={`team-sms-remove-${i}`}>
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              <span className="text-[9px] text-[#94A3B8] font-black uppercase tracking-[0.3em] mr-1 self-center">Areas</span>
              {areas.map((a) => {
                const on = (row.areas || []).includes(a.id);
                return (
                  <button key={a.id} onClick={() => toggleArea(i, a.id)}
                    data-testid={`team-sms-area-${i}-${a.id}`}
                    className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.18em] transition ${on ? "bg-[#0B3B5C] text-white" : "border border-[#E2E8F0] bg-white text-[#64748B] hover:border-[#0B3B5C]/40 hover:text-[#0B3B5C]"}`}>
                    {a.label}
                  </button>
                );
              })}
              {(row.areas || []).length === 0 && (
                <span className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-2 py-1 ml-1">⚠️ Pick at least one area or this team gets nothing</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
