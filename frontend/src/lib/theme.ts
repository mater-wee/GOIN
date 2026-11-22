import { useCallback, useState } from "react";

export type Theme = "midnight" | "lavender" | "graphite";

export const THEMES: readonly Theme[] = ["midnight", "lavender", "graphite"];

/** Must match the key read by the inline script in index.html. */
const STORAGE_KEY = "goin:theme";

/** Accepts a known theme, maps the old light/dark values, and rejects anything else. */
export function normalizeTheme(v: string | null | undefined): Theme | null {
  if (v === "dark") return "midnight";
  if (v === "light") return "lavender";
  return THEMES.find((t) => t === v) ?? null;
}

function savedTheme(): Theme | null {
  try {
    return normalizeTheme(localStorage.getItem(STORAGE_KEY));
  } catch {
    return null;
  }
}

/**
 * Midnight Galaxy, Cloud Lavender, or Graphite. Midnight Galaxy is the default;
 * the user's choice is remembered in this browser.
 */
export function useTheme(): { theme: Theme; setTheme: (t: Theme) => void } {
  const [theme, setThemeState] = useState<Theme>(
    () => normalizeTheme(document.documentElement.dataset.theme) ?? savedTheme() ?? "midnight",
  );

  const setTheme = useCallback((next: Theme) => {
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Storage can be blocked (private mode); the theme still applies for this visit.
    }
    setThemeState(next);
  }, []);

  return { theme, setTheme };
}
