import { useMemo } from "react";

/** Small seeded random generator, so the stars stay in the same place on every render. */
function seeded(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Mostly white, with a few faint blue and warm stars, like a real night sky.
const TINTS = ["255,255,255", "255,255,255", "255,255,255", "200,220,255", "255,240,215"];

/**
 * Builds one star layer as a list of box-shadows. Positions are in vw/vh,
 * so the stars spread across any screen size without repeating.
 */
function layer(random: () => number, count: number, minAlpha: number, glow: number): string {
  const stars: string[] = [];
  for (let i = 0; i < count; i++) {
    const x = (random() * 100).toFixed(2);
    const y = (random() * 100).toFixed(2);
    const alpha = (minAlpha + random() * (1 - minAlpha)).toFixed(2);
    const tint = TINTS[Math.floor(random() * TINTS.length)];
    stars.push(`${x}vw ${y}vh ${glow}px 0 rgba(${tint},${alpha})`);
  }
  return stars.join(",");
}

/** Fixed starfield behind the app. Only visible in Midnight Galaxy (see --stars-display). */
export function Starfield() {
  const layers = useMemo(() => {
    const random = seeded(20261119);
    return {
      dust: layer(random, 140, 0.25, 0),
      small: layer(random, 70, 0.45, 0),
      twinkleA: layer(random, 24, 0.6, 1),
      twinkleB: layer(random, 24, 0.6, 1),
      bright: layer(random, 8, 0.85, 3),
    };
  }, []);

  return (
    <div className="starfield" aria-hidden>
      <span className="stars stars-dust" style={{ boxShadow: layers.dust }} />
      <span className="stars stars-small" style={{ boxShadow: layers.small }} />
      <span className="stars stars-twinkle-a" style={{ boxShadow: layers.twinkleA }} />
      <span className="stars stars-twinkle-b" style={{ boxShadow: layers.twinkleB }} />
      <span className="stars stars-bright" style={{ boxShadow: layers.bright }} />
    </div>
  );
}
