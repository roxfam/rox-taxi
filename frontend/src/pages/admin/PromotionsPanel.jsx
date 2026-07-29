import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Percent, DollarSign, Plus, Trash2, ToggleRight, ToggleLeft, Save, X, Sparkles, Tag, Clock } from "lucide-react";
import { api, money } from "../../lib/api";

// Admin panel — run promotions (sitewide sales). Every active promo auto-
// applies to matching bookings on POST /api/bookings.
const SERVICE_CHOICES = [
  { key: "all",    label: "All services" },
  { key: "taxi",   label: "Taxi" },
  { key: "tour",   label: "Tour" },
  { key: "rental", label: "Rental" },
];

const emptyForm = {
  label: "",
  description: "",
  discount_type: "percent",
  discount_value: 10,
  applies_to: ["all"],
  starts_at: "",
  ends_at: "",
  active: true,
};

export default function PromotionsPanel() {
  const [promos, setPromos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(emptyForm);
  const [creating, setCreating] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/admin/promotions");
      setPromos(data);
    } catch { toast.error("Failed to load promotions"); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const toggleAppliesTo = (key) => {
    setForm((f) => {
      const has = f.applies_to.includes(key);
      let next = has ? f.applies_to.filter((k) => k !== key) : [...f.applies_to, key];
      // Selecting "all" clears the rest; selecting a specific type removes "all"
      if (!has && key === "all") next = ["all"];
      else if (!has && key !== "all") next = next.filter((k) => k !== "all");
      if (next.length === 0) next = ["all"];
      return { ...f, applies_to: next };
    });
  };

  const submit = async () => {
    if (!form.label.trim() || form.label.length < 2) { toast.error("Label required (2+ chars)"); return; }
    if (!(form.discount_value > 0)) { toast.error("Discount must be > 0"); return; }
    setCreating(true);
    try {
      const payload = {
        ...form,
        discount_value: Number(form.discount_value),
        starts_at: form.starts_at ? new Date(form.starts_at).toISOString() : null,
        ends_at: form.ends_at ? new Date(form.ends_at).toISOString() : null,
      };
      await api.post("/admin/promotions", payload);
      toast.success("Promotion created");
      setForm(emptyForm);
      load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Create failed");
    } finally { setCreating(false); }
  };

  const toggleActive = async (p) => {
    try {
      await api.patch(`/admin/promotions/${p.id}`, { active: !p.active });
      load();
    } catch { toast.error("Toggle failed"); }
  };

  const del = async (p) => {
    if (!window.confirm(`Delete promotion "${p.label}"?`)) return;
    try {
      await api.delete(`/admin/promotions/${p.id}`);
      toast.success("Deleted");
      load();
    } catch { toast.error("Delete failed"); }
  };

  return (
    <div data-testid="admin-promotions-panel" className="space-y-6">
      {/* Create form */}
      <div className="rounded-2xl border border-[#E2E8F0] bg-white p-6 shadow-sm">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-xl bg-[#E86A3C]/12 text-[#E86A3C] flex items-center justify-center">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <h2 className="serif text-xl text-[#0B3B5C]">Run a promotion</h2>
            <p className="text-xs text-[#64748B]">Active promos auto-apply the biggest match to every booking.</p>
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          <label className="block">
            <span className="text-[11px] uppercase tracking-widest text-[#64748B] font-semibold">Label</span>
            <input
              type="text" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })}
              placeholder="e.g. Cruise-week 15% off"
              className="mt-1 w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm focus:outline-none focus:border-[#D4A94A]"
              data-testid="promotion-label"
            />
          </label>
          <label className="block">
            <span className="text-[11px] uppercase tracking-widest text-[#64748B] font-semibold">Description (optional)</span>
            <input
              type="text" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Shown on banners"
              className="mt-1 w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm focus:outline-none focus:border-[#D4A94A]"
              data-testid="promotion-description"
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label>
              <span className="text-[11px] uppercase tracking-widest text-[#64748B] font-semibold">Discount type</span>
              <div className="mt-1 inline-flex rounded-lg bg-[#F1F5F9] p-0.5 w-full">
                <button
                  type="button"
                  onClick={() => setForm({ ...form, discount_type: "percent" })}
                  className={`flex-1 text-sm px-3 py-1.5 rounded-md font-semibold inline-flex items-center justify-center gap-1 ${form.discount_type === "percent" ? "bg-white text-[#0B3B5C] shadow-sm" : "text-[#64748B]"}`}
                  data-testid="promotion-type-percent"
                >
                  <Percent className="w-3 h-3" /> %
                </button>
                <button
                  type="button"
                  onClick={() => setForm({ ...form, discount_type: "fixed" })}
                  className={`flex-1 text-sm px-3 py-1.5 rounded-md font-semibold inline-flex items-center justify-center gap-1 ${form.discount_type === "fixed" ? "bg-white text-[#0B3B5C] shadow-sm" : "text-[#64748B]"}`}
                  data-testid="promotion-type-fixed"
                >
                  <DollarSign className="w-3 h-3" /> $
                </button>
              </div>
            </label>
            <label>
              <span className="text-[11px] uppercase tracking-widest text-[#64748B] font-semibold">Value</span>
              <input
                type="number" min="0" step="1" value={form.discount_value}
                onChange={(e) => setForm({ ...form, discount_value: e.target.value })}
                className="mt-1 w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm focus:outline-none focus:border-[#D4A94A]"
                data-testid="promotion-value"
              />
            </label>
          </div>

          <div>
            <span className="text-[11px] uppercase tracking-widest text-[#64748B] font-semibold">Applies to</span>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {SERVICE_CHOICES.map((c) => {
                const active = form.applies_to.includes(c.key);
                return (
                  <button
                    key={c.key} type="button"
                    onClick={() => toggleAppliesTo(c.key)}
                    className={`text-xs px-3 py-1.5 rounded-full font-semibold transition-colors border ${active ? "bg-[#0B3B5C] text-white border-[#0B3B5C]" : "bg-white text-[#64748B] border-[#E2E8F0] hover:border-[#0B3B5C]"}`}
                    data-testid={`promotion-applies-${c.key}`}
                  >
                    {c.label}
                  </button>
                );
              })}
            </div>
          </div>

          <label>
            <span className="text-[11px] uppercase tracking-widest text-[#64748B] font-semibold">Starts (optional)</span>
            <input type="datetime-local" value={form.starts_at} onChange={(e) => setForm({ ...form, starts_at: e.target.value })}
              className="mt-1 w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm focus:outline-none focus:border-[#D4A94A]"
              data-testid="promotion-starts"
            />
          </label>
          <label>
            <span className="text-[11px] uppercase tracking-widest text-[#64748B] font-semibold">Ends (optional)</span>
            <input type="datetime-local" value={form.ends_at} onChange={(e) => setForm({ ...form, ends_at: e.target.value })}
              className="mt-1 w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm focus:outline-none focus:border-[#D4A94A]"
              data-testid="promotion-ends"
            />
          </label>
        </div>

        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            onClick={() => setForm(emptyForm)}
            className="text-sm rounded-full px-4 py-2 text-[#64748B] hover:text-[#0B3B5C] inline-flex items-center gap-1.5"
            data-testid="promotion-reset"
          >
            <X className="w-3.5 h-3.5" /> Clear
          </button>
          <button
            onClick={submit}
            disabled={creating}
            className="btn-shine rounded-full bg-[#E86A3C] hover:bg-[#d05a2f] text-white text-sm font-semibold px-5 py-2 inline-flex items-center gap-1.5 disabled:opacity-60 active:scale-95"
            data-testid="promotion-create"
          >
            {creating ? <Save className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
            Launch promotion
          </button>
        </div>
      </div>

      {/* Existing list */}
      <div>
        <h3 className="serif text-lg text-[#0B3B5C] mb-3">Existing promotions</h3>
        {loading ? (
          <div className="text-center text-[#64748B] py-8" data-testid="promotions-loading">Loading…</div>
        ) : promos.length === 0 ? (
          <div className="text-center text-[#64748B] py-12 rounded-2xl bg-white border border-[#E2E8F0]" data-testid="promotions-empty">
            <Tag className="w-8 h-8 mx-auto text-[#94a3b8] mb-2" /> No promotions yet.
          </div>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4" data-testid="promotions-list">
            {promos.map((p) => (
              <div
                key={p.id}
                className={`rounded-2xl border p-5 bg-white flex flex-col gap-3 ${p.live ? "border-[#059669] shadow-[0_0_0_2px_rgba(5,150,105,0.12)]" : "border-[#E2E8F0]"}`}
                data-testid={`promotion-card-${p.id}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-[#0B3B5C] font-bold text-sm">{p.label}</div>
                    {p.description && <div className="text-[11px] text-[#64748B] mt-0.5">{p.description}</div>}
                  </div>
                  <span
                    className={`shrink-0 text-[10px] uppercase tracking-widest font-bold px-2 py-1 rounded-full ${p.live ? "bg-[#059669]/12 text-[#059669]" : "bg-[#94a3b8]/12 text-[#64748B]"}`}
                    data-testid={`promotion-live-${p.id}`}
                  >
                    {p.live ? "Live" : p.active ? "Scheduled" : "Off"}
                  </span>
                </div>

                <div className="text-2xl mono font-black text-[#E86A3C] leading-none">
                  {p.discount_type === "percent" ? `${p.discount_value}%` : money(p.discount_value)}
                  <span className="text-[10px] tracking-widest uppercase text-[#64748B] ml-2 font-normal">off</span>
                </div>

                <div className="flex flex-wrap gap-1">
                  {(p.applies_to || []).map((k) => (
                    <span key={k} className="text-[10px] rounded-full bg-[#F1F5F9] text-[#0B3B5C] font-semibold px-2 py-0.5">
                      {k}
                    </span>
                  ))}
                </div>

                {(p.starts_at || p.ends_at) && (
                  <div className="text-[11px] text-[#64748B] inline-flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {p.starts_at && new Date(p.starts_at).toLocaleDateString()} →{" "}
                    {p.ends_at ? new Date(p.ends_at).toLocaleDateString() : "no end"}
                  </div>
                )}

                <div className="mt-auto pt-2 flex gap-2">
                  <button
                    onClick={() => toggleActive(p)}
                    className={`flex-1 inline-flex items-center justify-center gap-1.5 rounded-full text-xs font-semibold py-2 active:scale-95 ${p.active ? "bg-white border border-[#E2E8F0] text-[#64748B] hover:border-[#DC2626] hover:text-[#DC2626]" : "bg-[#059669] hover:bg-[#047857] text-white"}`}
                    data-testid={`promotion-toggle-${p.id}`}
                  >
                    {p.active ? <><ToggleLeft className="w-3.5 h-3.5" /> Pause</> : <><ToggleRight className="w-3.5 h-3.5" /> Activate</>}
                  </button>
                  <button
                    onClick={() => del(p)}
                    className="rounded-full bg-white border border-[#E2E8F0] hover:border-[#DC2626] hover:text-[#DC2626] text-[#94a3b8] w-9 h-9 inline-flex items-center justify-center"
                    data-testid={`promotion-delete-${p.id}`}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
