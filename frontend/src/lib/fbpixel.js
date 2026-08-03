// Meta / Facebook Pixel event helpers.
//
// All helpers are no-ops when the pixel hasn't been loaded yet
// (e.g. admin hasn't set FB_PIXEL_ID, or the visitor blocks trackers).
// This means callers can fire events unconditionally — safe by default.
//
// Standard Meta event names used here:
//   - Lead      : visitor submitted their contact info / booking form
//                 (paid or not — Meta lets you build audiences from this)
//   - Purchase  : booking was actually paid (Stripe/PayPal capture success)
//
// Both events carry `value` + `currency` so Meta can report on ROAS
// (return on ad spend) inside Events Manager.

function fbqSafe(...args) {
  if (typeof window === "undefined") return;
  if (typeof window.fbq !== "function") return;
  try { window.fbq(...args); } catch { /* never throw from analytics */ }
}

/** Fire when a visitor completes the booking form (before payment). */
export function trackLead({ value, currency = "USD", contentName, contentCategory } = {}) {
  const payload = { currency };
  if (Number.isFinite(value)) payload.value = Number(value.toFixed ? value.toFixed(2) : value);
  if (contentName)     payload.content_name = contentName;
  if (contentCategory) payload.content_category = contentCategory;
  fbqSafe("track", "Lead", payload);
}

/** Fire when payment succeeds (Stripe or PayPal capture). */
export function trackPurchase({ value, currency = "USD", contentName, contentCategory, orderId } = {}) {
  const payload = { currency };
  if (Number.isFinite(value)) payload.value = Number(value.toFixed ? value.toFixed(2) : value);
  if (contentName)     payload.content_name = contentName;
  if (contentCategory) payload.content_category = contentCategory;
  const opts = orderId ? { eventID: String(orderId) } : undefined; // dedupe if you later add server-side CAPI
  fbqSafe("track", "Purchase", payload, opts);
}

/** Fire when a visitor lands on the checkout page (Pay.jsx). */
export function trackInitiateCheckout({ value, currency = "USD", contentName } = {}) {
  const payload = { currency };
  if (Number.isFinite(value)) payload.value = Number(value.toFixed ? value.toFixed(2) : value);
  if (contentName) payload.content_name = contentName;
  fbqSafe("track", "InitiateCheckout", payload);
}
