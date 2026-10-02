import axios from "axios";

export const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const API = `${BACKEND_URL}/api`;

// Read a cookie value by name. Returns "" if the cookie isn't set.
// Used to pull the readable `admin_csrf` double-submit token.
function readCookie(name) {
  if (typeof document === "undefined") return "";
  const row = document.cookie.split("; ").find((r) => r.startsWith(name + "="));
  return row ? decodeURIComponent(row.slice(name.length + 1)) : "";
}

// Axios instance that sends the httpOnly `admin_session` cookie on
// every call (withCredentials) and attaches the `X-CSRF-Token` header
// on mutating methods so the backend's double-submit check passes.
export const api = axios.create({ baseURL: API, withCredentials: true });

api.interceptors.request.use((config) => {
  const method = (config.method || "get").toLowerCase();
  if (["post", "put", "patch", "delete"].includes(method)) {
    const csrf = readCookie("admin_csrf");
    if (csrf) config.headers["X-CSRF-Token"] = csrf;
  }
  // Transitional fallback: any browser that still has a legacy localStorage
  // token (from before this migration) keeps working until the next login.
  // Remove this block once we're confident no stale sessions remain.
  const legacy = typeof localStorage !== "undefined" ? localStorage.getItem("admin_token") : null;
  if (legacy && !config.headers.Authorization) {
    config.headers.Authorization = `Bearer ${legacy}`;
  }
  return config;
});

// Pages use these helpers instead of poking at storage directly, so the
// guard + logout contract stays in one place.
export function isAdminAuthed() {
  if (typeof window === "undefined") return false;
  return !!(
    sessionStorage.getItem("admin_email") ||
    localStorage.getItem("admin_token") // legacy sessions still count
  );
}

export function clearAdminAuth() {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem("admin_email");
  localStorage.removeItem("admin_token");
  localStorage.removeItem("admin_email");
}

export async function adminLogout() {
  try {
    await api.post("/auth/admin-logout");
  } catch (_) {
    /* best effort — cookies are cleared below regardless */
  }
  clearAdminAuth();
}

export const money = (n) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n || 0);

export const STATUS_STEPS = [
  { key: "confirmed", label: "Confirmed" },
  { key: "driver_assigned", label: "Driver Assigned" },
  { key: "en_route", label: "En Route" },
  { key: "arrived", label: "Arrived" },
  { key: "completed", label: "Completed" },
];

export const STATUS_INDEX = (s) => STATUS_STEPS.findIndex((x) => x.key === s);
