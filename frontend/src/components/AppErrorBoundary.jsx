import { Component } from "react";

const RELOAD_KEY = "rox_chunk_reload_at";

export default class AppErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error) {
    const msg = String(error?.message || error);
    const isChunk = error?.name === "ChunkLoadError" || /Loading (CSS )?chunk|dynamically imported module/i.test(msg);
    const last = Number(sessionStorage.getItem(RELOAD_KEY) || 0);
    if (isChunk && Date.now() - last > 30000) {
      sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
      if (navigator.serviceWorker) {
        navigator.serviceWorker.getRegistrations().then((rs) => rs.forEach((r) => r.unregister()));
      }
      if (window.caches) {
        caches.keys().then((ks) => ks.forEach((k) => caches.delete(k)));
      }
      setTimeout(() => window.location.reload(), 300);
    }
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FAF9F6] p-6" data-testid="app-error-boundary">
        <div className="max-w-lg w-full bg-white border border-[#E2E8F0] rounded-xl p-6">
          <h1 className="font-[Georgia] text-2xl text-[#0B3B5C]">Something went wrong loading this page</h1>
          <p className="mt-2 text-sm text-[#64748B]">Please send this message to support:</p>
          <pre className="mt-3 text-xs bg-[#F8FAFC] border border-[#E2E8F0] rounded p-3 whitespace-pre-wrap break-words text-red-700" data-testid="app-error-message">
            {String(error?.stack || error?.message || error).slice(0, 1200)}
          </pre>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-4 px-4 py-2 rounded-full bg-[#0B3B5C] text-white text-sm font-semibold"
            data-testid="app-error-reload-btn"
          >
            Reload page
          </button>
        </div>
      </div>
    );
  }
}
