import { type RefObject, useEffect, useLayoutEffect, useRef } from "react";

const REDUCED_QUERY = "(prefers-reduced-motion: reduce)";
const PARALLAX_QUERY = "(pointer: fine) and (prefers-reduced-motion: no-preference)";

function matches(query: string): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia(query).matches;
}

/** True when the user asked for reduced motion. False if matchMedia is unavailable. */
export function prefersReducedMotion(): boolean {
  return matches(REDUCED_QUERY);
}

/**
 * Scroll reveal for every [data-reveal] element in the app. Called once in App.
 * Content is hidden (html.reveal-on) only after the observer is watching it, and the
 * revealed state is a data attribute so React's className updates never re-hide it.
 */
export function useRevealObserver(): void {
  useLayoutEffect(() => {
    if (prefersReducedMotion() || !("IntersectionObserver" in window)) return;
    const root = document.documentElement;

    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const el = entry.target as HTMLElement;
          el.dataset.revealed = "";
          io.unobserve(el);
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.08 },
    );
    // Full rescan: route changes insert wrappers whose descendants carry data-reveal.
    // Observing an already observed element is a no-op.
    const scan = () =>
      document.querySelectorAll<HTMLElement>("[data-reveal]:not([data-revealed])").forEach((el) => io.observe(el));

    scan();
    root.classList.add("reveal-on");

    const mo = new MutationObserver(scan);
    const appRoot = document.getElementById("root");
    if (appRoot) mo.observe(appRoot, { childList: true, subtree: true });

    const teardown = () => {
      io.disconnect();
      mo.disconnect();
      root.classList.remove("reveal-on");
    };

    const media = typeof window.matchMedia === "function" ? window.matchMedia(REDUCED_QUERY) : null;
    const onMotionChange = (e: MediaQueryListEvent) => {
      if (!e.matches) return;
      teardown();
      document.querySelectorAll<HTMLElement>("[data-reveal]").forEach((el) => {
        el.dataset.revealed = "";
      });
    };
    media?.addEventListener("change", onMotionChange);

    return () => {
      media?.removeEventListener("change", onMotionChange);
      teardown();
    };
  }, []);
}

/**
 * Hero motion: marks the hero data-inview="true|false" so its loops pause off-screen, and
 * (fine pointer, no reduced motion) writes --px/--py in [-1, 1] for the parallax layers.
 */
export function useHeroMotion<T extends HTMLElement>(): RefObject<T | null> {
  const ref = useRef<T | null>(null);

  useEffect(() => {
    const hero = ref.current;
    if (!hero) return;

    let io: IntersectionObserver | null = null;
    if ("IntersectionObserver" in window) {
      io = new IntersectionObserver((entries) => {
        for (const entry of entries) hero.dataset.inview = entry.isIntersecting ? "true" : "false";
      });
      io.observe(hero);
    }

    if (!matches(PARALLAX_QUERY)) {
      return () => io?.disconnect();
    }

    let frame = 0;
    let x = 0;
    let y = 0;
    const write = () => {
      frame = 0;
      const r = hero.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return;
      const px = Math.max(-1, Math.min(1, ((x - r.left) / r.width) * 2 - 1));
      const py = Math.max(-1, Math.min(1, ((y - r.top) / r.height) * 2 - 1));
      hero.style.setProperty("--px", px.toFixed(3));
      hero.style.setProperty("--py", py.toFixed(3));
    };
    const onMove = (e: PointerEvent) => {
      x = e.clientX;
      y = e.clientY;
      if (!frame) frame = requestAnimationFrame(write);
    };
    const onLeave = () => {
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      hero.style.setProperty("--px", "0");
      hero.style.setProperty("--py", "0");
    };

    hero.addEventListener("pointermove", onMove, { passive: true });
    hero.addEventListener("pointerleave", onLeave);
    return () => {
      hero.removeEventListener("pointermove", onMove);
      hero.removeEventListener("pointerleave", onLeave);
      if (frame) cancelAnimationFrame(frame);
      io?.disconnect();
    };
  }, []);

  return ref;
}
