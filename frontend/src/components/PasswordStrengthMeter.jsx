import { useMemo } from "react";

/**
 * Score a password 0-4 on length + character-class diversity, penalising
 * obvious weak values (dictionary starts, all-same-char).
 * Returns { score, label, color, tips[], strong }.
 * Used by /reset-password and /signup to gate weak submissions.
 */
export function scorePassword(pw) {
  const tips = [];
  if (!pw) return { score: 0, label: "Enter a password", color: "#94a3b8", tips: [], strong: false };
  const len = pw.length;
  let score = 0;
  const classes = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/].filter((r) => r.test(pw)).length;
  if (len >= 6) score += 1;
  if (len >= 10) score += 1;
  if (classes >= 2) score += 1;
  if (classes >= 3 && len >= 12) score += 1;
  if (/^(password|qwerty|abc|111|123|letmein|iloveyou|admin|welcome)/i.test(pw)) score = Math.min(score, 1);
  if (/^(.)\1{4,}$/.test(pw)) score = Math.min(score, 1);

  if (len < 6) tips.push("At least 6 characters");
  if (classes < 2) tips.push("Mix letters, numbers & symbols");
  if (len < 10) tips.push("Longer is stronger — aim for 10+");

  const bands = [
    { label: "Too short", color: "#DC2626" },
    { label: "Weak",      color: "#DC2626" },
    { label: "Fair",      color: "#EAB308" },
    { label: "Strong",    color: "#16A34A" },
    { label: "Excellent", color: "#059669" },
  ];
  const b = bands[Math.min(score, 4)];
  return { score, label: b.label, color: b.color, tips, strong: score >= 2 };
}

export default function PasswordStrengthMeter({ password }) {
  const { score, label, color, tips } = useMemo(() => scorePassword(password), [password]);
  return (
    <div className="mt-2" data-testid="password-strength">
      <div className="flex gap-1" aria-hidden="true">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-1.5 flex-1 rounded-full transition-colors duration-200"
            style={{ background: i < score ? color : "#E2E8F0" }}
            data-testid={`password-strength-bar-${i}`}
          />
        ))}
      </div>
      <div className="mt-1.5 flex items-center justify-between text-[11px]">
        <span data-testid="password-strength-label" className="font-semibold" style={{ color }}>{label}</span>
        {tips.length > 0 && password && (
          <span className="text-[#94a3b8]" data-testid="password-strength-tip">{tips[0]}</span>
        )}
      </div>
    </div>
  );
}
