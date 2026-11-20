import type { Check } from "../lib/api";

const ICON: Record<Check["status"], string> = { ok: "✓", warn: "!", missing: "?" };

/** Results of comparing the listing with what was read from the receipt. */
export function ChecksList({ checks }: { checks: Check[] }) {
  const sorted = [...checks].sort((a, b) => Number(a.status === "ok") - Number(b.status === "ok"));
  return (
    <ul className="checks">
      {sorted.map((c, i) => (
        <li key={`${c.field}-${i}`} className={`check check-${c.status}`}>
          <span className="check-icon" aria-hidden>
            {ICON[c.status]}
          </span>
          <span>
            <strong>{c.label}:</strong> {c.message}
          </span>
        </li>
      ))}
    </ul>
  );
}
