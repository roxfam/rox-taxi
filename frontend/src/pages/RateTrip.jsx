import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "../lib/api";
import { Star, Check, MessageSquareHeart } from "lucide-react";
import { toast } from "sonner";

/**
 * RateTrip — /rate?id=<booking_id>&t=<hmac>
 *
 * 1-tap post-trip rating page. Guest lands here from the trip-complete
 * SMS + email. Signed HMAC token scopes the link to a single booking
 * so IDs can't be brute-forced. If the guest already rated, we render
 * the existing rating in read-only mode.
 */
export default function RateTrip() {
  const [params] = useSearchParams();
  const id = (params.get("id") || "").toUpperCase();
  const token = params.get("t") || "";

  const [info, setInfo] = useState(null);
  const [err, setErr] = useState("");
  const [stars, setStars] = useState(0);
  const [hover, setHover] = useState(0);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    let cancel = false;
    (async () => {
      try {
        const { data } = await api.get(`/bookings/${id}/rating-info?t=${encodeURIComponent(token)}`);
        if (!cancel) {
          setInfo(data);
          if (data.already_rated) {
            setStars(Number(data.existing_stars) || 0);
            setSubmitted(true);
          }
        }
      } catch (e) {
        if (!cancel) setErr(e?.response?.data?.detail || "This rating link isn't valid anymore.");
      }
    })();
    return () => { cancel = true; };
  }, [id, token]);

  const submit = async () => {
    if (!stars) { toast.error("Tap a star first"); return; }
    setSubmitting(true);
    try {
      await api.post(`/bookings/${id}/rate?t=${encodeURIComponent(token)}`, { stars, comment: comment.trim() });
      setSubmitted(true);
      toast.success(stars >= 5 ? "Thanks! Would you leave a Google review too?" : "Thanks for the feedback");
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  };

  if (err) {
    return (
      <div className="min-h-screen bg-[#0B3B5C] text-white flex items-center justify-center p-6 text-center" data-testid="rate-trip-error">
        <div className="max-w-sm">
          <MessageSquareHeart className="w-12 h-12 mx-auto text-[#D4A94A]" />
          <h1 className="font-[Georgia] text-2xl mt-4">Link expired</h1>
          <p className="text-white/70 text-sm mt-2">{err}</p>
        </div>
      </div>
    );
  }

  if (!info) {
    return (
      <div className="min-h-screen bg-[#0B3B5C] text-white flex items-center justify-center" data-testid="rate-trip-loading">
        <div className="text-sm text-white/70">Loading…</div>
      </div>
    );
  }

  const who = (info.customer_name || "there").split(" ")[0];
  const driver = info.driver_name || "your driver";

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0B3B5C] via-[#082941] to-[#0B3B5C] p-4 sm:p-8" data-testid="rate-trip-page">
      <div className="max-w-md mx-auto">
        <div className="text-center mb-6">
          <div className="inline-flex items-center gap-2 text-[11px] tracking-[.28em] uppercase text-[#D4A94A] font-bold">
            <MessageSquareHeart className="w-3.5 h-3.5" /> Trip complete
          </div>
          <h1 className="font-[Georgia] text-white text-3xl mt-2">How was it, {who}?</h1>
          <p className="text-white/60 text-sm mt-2">
            Your ride with <strong className="text-white">{driver}</strong>
            {info.item_name ? <> · {info.item_name}</> : null}
          </p>
        </div>

        {submitted ? (
          <div className="bg-white rounded-2xl p-8 shadow-2xl text-center" data-testid="rate-trip-submitted">
            <div className="w-16 h-16 mx-auto rounded-full bg-[#059669]/10 flex items-center justify-center">
              <Check className="w-8 h-8 text-[#059669]" />
            </div>
            <h2 className="mt-4 font-[Georgia] text-[#0B3B5C] text-2xl">Thanks for the feedback</h2>
            <div className="mt-4 flex justify-center gap-1">
              {[1, 2, 3, 4, 5].map((n) => (
                <Star key={n} className={`w-8 h-8 ${n <= stars ? "text-[#D4A94A] fill-[#D4A94A]" : "text-[#E2E8F0]"}`} />
              ))}
            </div>
            {stars >= 5 && (
              <a
                href="https://g.page/r/CYy0V1JN5XwtEAI/review"
                target="_blank"
                rel="noopener noreferrer"
                className="mt-6 inline-block bg-[#D4A94A] hover:bg-[#B8912F] text-[#0B3B5C] font-bold py-3 px-6 rounded-xl transition-colors"
                data-testid="rate-trip-google-review"
              >
                Leave a Google review →
              </a>
            )}
            <a
              href={`/tip-topup?id=${id}`}
              className="mt-3 block text-sm text-[#0B3B5C]/70 hover:text-[#D4A94A] underline"
              data-testid="rate-trip-tip-link"
            >
              Bump the driver's tip
            </a>
          </div>
        ) : (
          <div className="bg-white rounded-2xl p-6 shadow-2xl" data-testid="rate-trip-form">
            <div className="text-center">
              <div className="text-[11px] uppercase tracking-[.22em] text-[#64748B] font-bold">Tap a star</div>
              <div className="mt-4 flex justify-center gap-2">
                {[1, 2, 3, 4, 5].map((n) => {
                  const active = (hover || stars) >= n;
                  return (
                    <button
                      key={n}
                      type="button"
                      onMouseEnter={() => setHover(n)}
                      onMouseLeave={() => setHover(0)}
                      onClick={() => setStars(n)}
                      className="p-1 transition-transform hover:scale-110"
                      data-testid={`rate-trip-star-${n}`}
                      aria-label={`${n} stars`}
                    >
                      <Star className={`w-12 h-12 sm:w-14 sm:h-14 ${active ? "text-[#D4A94A] fill-[#D4A94A]" : "text-[#E2E8F0]"}`} />
                    </button>
                  );
                })}
              </div>
              {stars > 0 && (
                <div className="mt-2 text-[13px] text-[#0B3B5C] font-semibold">
                  {["😞 Not great", "😕 Meh", "🙂 Okay", "😊 Great", "🤩 Amazing"][stars - 1]}
                </div>
              )}
            </div>

            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Any details? (optional)"
              rows={3}
              className="mt-6 w-full px-4 py-3 border border-[#E2E8F0] rounded-lg text-sm focus:outline-none focus:border-[#D4A94A] resize-none"
              maxLength={1000}
              data-testid="rate-trip-comment"
            />

            <button
              onClick={submit}
              disabled={submitting || !stars}
              className="mt-4 w-full bg-[#0B3B5C] hover:bg-[#082941] disabled:opacity-50 text-white font-bold py-3.5 rounded-xl transition-colors"
              data-testid="rate-trip-submit"
            >
              {submitting ? "Sending…" : "Send rating"}
            </button>
            <p className="mt-3 text-center text-[11px] text-[#94a3b8]">
              Booking <span className="font-mono">{id}</span>
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
