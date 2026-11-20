// Mirror of backend phone_utils.normalize_phone: tidy a typed number to +country digits.
export function normalizePhone(raw) {
  const s = String(raw || "").trim();
  if (!s) return "";
  const d = s.replace(/\D/g, "");
  if (!d) return s;
  if (s.startsWith("+")) return `+${d}`;
  if (d.startsWith("00")) return `+${d.slice(2)}`;
  if (d.length === 7) return `+1242${d}`;
  if (d.length === 10) return `+1${d}`;
  return `+${d}`;
}
