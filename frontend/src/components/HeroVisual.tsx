import { Nfc } from "lucide-react";
import { useId, useMemo } from "react";
import { Icon } from "./Icon";

/* Decorative hero artwork. Pure presentation: aria-hidden, no data, no props.
   Card text is limited to the mark "G", "GOIN", "USDC", and dot groups (no numbers). */

const STARS: { top: string; left: string; opacity: number }[] = [
  { top: "6%", left: "14%", opacity: 0.6 },
  { top: "14%", left: "84%", opacity: 0.45 },
  { top: "24%", left: "6%", opacity: 0.35 },
  { top: "31%", left: "94%", opacity: 0.7 },
  { top: "58%", left: "3%", opacity: 0.5 },
  { top: "70%", left: "18%", opacity: 0.4 },
  { top: "88%", left: "40%", opacity: 0.6 },
  { top: "92%", left: "78%", opacity: 0.35 },
  { top: "4%", left: "62%", opacity: 0.5 },
];

export function HeroVisual() {
  return (
    <div className="hero-visual" aria-hidden="true">
      <div className="hv-sphere" />
      <svg className="hv-orbit" viewBox="0 0 100 100" focusable="false">
        <ellipse className="hv-orbit-outer" cx="50" cy="50" rx="48" ry="15" />
        <ellipse className="hv-orbit-inner" cx="50" cy="50" rx="42" ry="12" />
        <circle className="hv-moon" cx="91.6" cy="57.5" r="0.9" />
      </svg>
      <div className="hv-planet" />
      <div className="hv-stars">
        {STARS.map((s, i) => (
          <span key={i} style={{ top: s.top, left: s.left, opacity: s.opacity }} />
        ))}
      </div>
      <div className="hv-card hv-card-back">
        <span className="hv-mark">G</span>{" "}
        <span className="hv-number">•••• ••••</span>
      </div>{" "}
      <div className="hv-card hv-card-front">
        <div className="hv-card-row">
          <span className="hv-brand">
            <span className="hv-mark">G</span> <span className="hv-name">GOIN</span>
          </span>{" "}
          <Icon icon={Nfc} size={22} className="hv-nfc" />
        </div>{" "}
        <span className="hv-chip" />{" "}
        <div className="hv-card-row">
          <span className="hv-number">•••• •••• •••• ••••</span> <span className="hv-currency">USDC</span>
        </div>
      </div>
    </div>
  );
}

const ROWS = 7;
const COLS = 46;

/** Dotted sine wave for the hero backdrop. Deterministic points, faded left to right by a mask. */
export function DotWave({ className }: { className?: string }) {
  // useId output can contain ":" or "«»"; keep only URL-fragment-safe characters for url(#…).
  const id = useId().replace(/[^\w-]/g, "");
  const g = `dw-g-${id}`;
  const m = `dw-m-${id}`;
  const circles = useMemo(() => {
    const out = [];
    for (let row = 0; row < ROWS; row++) {
      const base = 96 + row * 22;
      for (let col = 0; col < COLS; col++) {
        const x = 8 + col * (584 / (COLS - 1));
        const y = base + 28 * Math.sin(x * 0.0125 + row * 0.55);
        const r = 1 + 0.6 * (0.5 + 0.5 * Math.sin(x * 0.02 + row));
        out.push(<circle key={`${row}-${col}`} cx={x.toFixed(1)} cy={y.toFixed(1)} r={r.toFixed(2)} />);
      }
    }
    return out;
  }, []);

  return (
    <svg className={className} viewBox="0 0 600 300" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={g} x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor="#fff" />
          <stop offset="1" stopColor="#000" />
        </linearGradient>
        <mask id={m}>
          <rect width="600" height="300" fill={`url(#${g})`} />
        </mask>
      </defs>
      <g mask={`url(#${m})`} style={{ fill: "var(--dots)" }}>
        {circles}
      </g>
    </svg>
  );
}
