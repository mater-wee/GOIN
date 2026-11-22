import { CircleCheck, CircleHelp, TriangleAlert, type LucideIcon } from "lucide-react";
import type { Check } from "../lib/api";
import { Icon } from "./Icon";

const ICON: Record<Check["status"], LucideIcon> = { ok: CircleCheck, warn: TriangleAlert, missing: CircleHelp };

/** Results of comparing the listing with what was read from the receipt. */
export function ChecksList({ checks }: { checks: Check[] }) {
  const sorted = [...checks].sort((a, b) => Number(a.status === "ok") - Number(b.status === "ok"));
  return (
    <ul className="checks">
      {sorted.map((c, i) => (
        <li key={`${c.field}-${i}`} className={`check check-${c.status}`}>
          <Icon icon={ICON[c.status]} className="check-icon" />
          <span>
            <strong>{c.label}:</strong> {c.message}
          </span>
        </li>
      ))}
    </ul>
  );
}
