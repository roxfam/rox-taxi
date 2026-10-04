/**
 * Payment-brand mini-logos — pure inline SVG so they ship with the JS
 * bundle (no sprite / network cost / blocked-tracker risk) and scale
 * crisply on every DPI including the retina screenshots guests tend to
 * share. Each badge renders inside a white tile with a thin border so
 * it stands out whether we're on the light checkout canvas or a dark
 * email background.
 *
 * Usage:
 *   import { VisaBrand, MastercardBrand, AmexBrand, DiscoverBrand,
 *            ApplePayBrand, GooglePayBrand, PaymentBrandRow } from "../components/PaymentBrands";
 *   <PaymentBrandRow />
 */

function Wrap({ children, title, w = 36 }) {
  return (
    <span
      title={title}
      aria-label={title}
      className="inline-flex items-center justify-center bg-white border border-[#E2E8F0] rounded-md shrink-0"
      style={{ width: w, height: 22, padding: "2px 4px" }}
    >
      {children}
    </span>
  );
}

export function VisaBrand() {
  return (
    <Wrap title="Visa">
      <svg viewBox="0 0 32 10" width="28" height="10" aria-hidden="true">
        <text
          x="0" y="9" fontFamily="'Helvetica Neue', Arial, sans-serif"
          fontWeight="900" fontStyle="italic" fontSize="12" fill="#1A1F71"
          letterSpacing="-0.5"
        >VISA</text>
      </svg>
    </Wrap>
  );
}

export function MastercardBrand() {
  return (
    <Wrap title="Mastercard">
      <svg viewBox="0 0 26 16" width="24" height="14" aria-hidden="true">
        <circle cx="9" cy="8" r="7" fill="#EB001B" />
        <circle cx="17" cy="8" r="7" fill="#F79E1B" />
        <path
          d="M13 2.6 a7 7 0 0 0 0 10.8 a7 7 0 0 0 0-10.8z"
          fill="#FF5F00"
        />
      </svg>
    </Wrap>
  );
}

export function AmexBrand() {
  return (
    <Wrap title="American Express">
      <svg viewBox="0 0 36 16" width="30" height="14" aria-hidden="true">
        <rect width="36" height="16" rx="2" fill="#006FCF" />
        <text
          x="18" y="11" textAnchor="middle"
          fontFamily="'Helvetica Neue', Arial, sans-serif"
          fontWeight="800" fontSize="8" fill="#fff" letterSpacing="0.3"
        >AMEX</text>
      </svg>
    </Wrap>
  );
}

export function DiscoverBrand() {
  return (
    <Wrap title="Discover" w={44}>
      <svg viewBox="0 0 48 12" width="40" height="10" aria-hidden="true">
        <text
          x="0" y="9" fontFamily="'Helvetica Neue', Arial, sans-serif"
          fontWeight="800" fontSize="9" fill="#231F20"
        >DISC</text>
        <circle cx="35" cy="6" r="4" fill="#FF6000" />
      </svg>
    </Wrap>
  );
}

export function ApplePayBrand() {
  return (
    <Wrap title="Apple Pay">
      <svg viewBox="0 0 32 12" width="28" height="12" aria-hidden="true">
        {/* Apple glyph */}
        <path
          d="M6.4 3.6c.3-.4.5-1 .5-1.5 -.5 0-1.1.3-1.5.7 -.3.3-.6.9-.5 1.4 .5 0 1.1-.3 1.5-.6z
             M7.4 4.5c-.8 0-1.5.5-1.9.5 -.4 0-1-.4-1.7-.4 -.9 0-1.7.5-2.1 1.3 -.9 1.6-.2 3.9.7 5.1
             .4.6.9 1.3 1.6 1.3 .6 0 .9-.4 1.7-.4 .8 0 1 .4 1.7.4 .7 0 1.1-.6 1.6-1.2
             .5-.7.7-1.4.7-1.4 -.1 0-1.4-.5-1.4-2.1 0-1.3 1.1-1.9 1.1-1.9 -.6-.9-1.5-1-1.8-1z"
          fill="#000"
        />
        <text
          x="12" y="9" fontFamily="'Helvetica Neue', Arial, sans-serif"
          fontWeight="700" fontSize="8" fill="#000"
        >Pay</text>
      </svg>
    </Wrap>
  );
}

export function GooglePayBrand() {
  return (
    <Wrap title="Google Pay" w={44}>
      <svg viewBox="0 0 44 12" width="40" height="12" aria-hidden="true">
        <text x="0"  y="9" fontFamily="'Helvetica Neue', Arial, sans-serif"
              fontWeight="700" fontSize="8" fill="#4285F4">G</text>
        <text x="6"  y="9" fontFamily="'Helvetica Neue', Arial, sans-serif"
              fontWeight="700" fontSize="8" fill="#EA4335">o</text>
        <text x="12" y="9" fontFamily="'Helvetica Neue', Arial, sans-serif"
              fontWeight="700" fontSize="8" fill="#FBBC04">o</text>
        <text x="18" y="9" fontFamily="'Helvetica Neue', Arial, sans-serif"
              fontWeight="700" fontSize="8" fill="#4285F4">g</text>
        <text x="24" y="9" fontFamily="'Helvetica Neue', Arial, sans-serif"
              fontWeight="700" fontSize="8" fill="#34A853">l</text>
        <text x="28" y="9" fontFamily="'Helvetica Neue', Arial, sans-serif"
              fontWeight="700" fontSize="8" fill="#EA4335">e</text>
        <text x="34" y="9" fontFamily="'Helvetica Neue', Arial, sans-serif"
              fontWeight="700" fontSize="8" fill="#5F6368">Pay</text>
      </svg>
    </Wrap>
  );
}

/** Compact brand row used on the Stripe PayCard — wraps cleanly on mobile. */
export function PaymentBrandRow() {
  return (
    <div className="flex items-center gap-1 flex-wrap">
      <VisaBrand />
      <MastercardBrand />
      <AmexBrand />
      <DiscoverBrand />
      <ApplePayBrand />
      <GooglePayBrand />
    </div>
  );
}
