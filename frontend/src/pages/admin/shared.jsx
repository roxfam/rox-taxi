// Shared low-level UI primitives + utilities for the /admin/manage panels.
// Extracted from AdminManage.jsx so each panel can be worked on in isolation.

export function resolveUrl(u) {
  if (!u) return "";
  if (u.startsWith("http")) return u;
  return `${process.env.REACT_APP_BACKEND_URL}${u}`;
}

// Clipboard fallback for browsers/contexts where navigator.clipboard is
// blocked (iframes, non-secure origins, permission-denied). Uses a temp
// textarea + document.execCommand("copy") so Copy URL always succeeds.
export function fallbackCopy(text, onSuccess) {
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    if (ok) onSuccess?.();
  } catch { /* best-effort */ }
}

export function F({ l, v, on, type = "text", textarea, testid }) {
  const props = {
    value: v,
    onChange: (e) => on(e.target.value),
    "data-testid": testid,
    className: "w-full rounded-md border border-[#E2E8F0] px-3 py-2 text-sm focus:border-[#D4A94A] focus:outline-none",
  };
  return (
    <div>
      <label className="block text-xs uppercase tracking-widest text-[#64748B] mb-1">{l}</label>
      {textarea ? <textarea rows={3} {...props} /> : <input type={type} {...props} />}
    </div>
  );
}

export function Toggle({ label, hint, checked, onChange, testid }) {
  return (
    <label
      className={`flex items-start gap-3 rounded-xl border p-3 cursor-pointer transition-colors ${checked ? "border-[#059669]/40 bg-[#059669]/5" : "border-[#E2E8F0] bg-white hover:bg-[#F8FAFC]"}`}
      data-testid={testid}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-1 accent-[#059669]"
        data-testid={`${testid}-checkbox`}
      />
      <span className="flex-1">
        <span className="block text-sm font-semibold text-[#0B3B5C]">{label}</span>
        <span className="block text-[11px] text-[#64748B] mt-0.5">{hint}</span>
      </span>
    </label>
  );
}
