// Small brand icon SVGs used across the site.
export function WhatsAppIcon({ className = "w-4 h-4" }) {
  return (
    <svg viewBox="0 0 32 32" className={className} fill="currentColor" aria-hidden>
      <path d="M19.11 17.205c-.372 0-1.088 1.39-1.518 1.39a.63.63 0 0 1-.315-.1c-.802-.402-1.504-.817-2.163-1.447-.545-.516-1.146-1.29-1.46-1.963a.426.426 0 0 1-.073-.215c0-.33.99-.945.99-1.49 0-.143-.73-2.09-.832-2.335-.143-.372-.214-.487-.6-.487-.187 0-.36-.043-.53-.043-.302 0-.53.115-.746.315-.688.645-1.032 1.318-1.06 2.264v.114c-.015.99.472 1.977 1.017 2.78 1.23 1.82 2.506 3.41 4.554 4.34.616.287 2.035.888 2.72.888.688 0 2.15-.53 2.478-1.15.13-.244.187-.517.187-.789 0-.216-1.535-1.028-1.75-1.028-.014 0-.014 0-.028-.014zM16 30.5C7.99 30.5 1.5 24.01 1.5 16S7.99 1.5 16 1.5 30.5 7.99 30.5 16c0 2.966-.9 5.836-2.607 8.32L30.5 30.5l-6.28-2.622A14.4 14.4 0 0 1 16 30.5zm0-26.1a11.5 11.5 0 0 0-11.5 11.5c0 2.564.83 5.008 2.42 7.075l.386.502-1.437 4.242 4.324-1.398.502.386A11.5 11.5 0 1 0 16 4.4z"/>
    </svg>
  );
}

export function TripAdvisorIcon({ className = "w-5 h-5" }) {
  return (
    <svg viewBox="0 0 40 24" className={className} aria-hidden xmlns="http://www.w3.org/2000/svg">
      <circle cx="12" cy="12" r="10" fill="currentColor" opacity="0.15" />
      <circle cx="28" cy="12" r="10" fill="currentColor" opacity="0.15" />
      <circle cx="12" cy="12" r="6.5" fill="none" stroke="currentColor" strokeWidth="2" />
      <circle cx="28" cy="12" r="6.5" fill="none" stroke="currentColor" strokeWidth="2" />
      <circle cx="12" cy="12" r="2.5" fill="currentColor" />
      <circle cx="28" cy="12" r="2.5" fill="currentColor" />
    </svg>
  );
}

export function PaypalIcon({ className = "w-4 h-4" }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <path fill="#003087" d="M20.067 8.478c.492 3.145-1.657 5.578-4.83 5.578h-.892c-.464 0-.86.34-.934.798l-.858 5.44a.75.75 0 0 1-.744.633H8.987a.5.5 0 0 1-.494-.578l1.842-11.68a.75.75 0 0 1 .744-.633h4.87c2.51 0 4.176 1.14 4.118 2.442z"/>
      <path fill="#009cde" d="M22.235 5.982C22.727 9.127 20.578 11.56 17.405 11.56h-.892c-.464 0-.86.34-.934.798l-.858 5.44a.75.75 0 0 1-.744.633h-2.822a.5.5 0 0 1-.494-.578l1.842-11.68a.75.75 0 0 1 .744-.633h4.87c2.51 0 4.176 1.14 4.118 2.442z"/>
    </svg>
  );
}
