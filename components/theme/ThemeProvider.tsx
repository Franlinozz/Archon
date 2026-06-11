"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
  DEFAULT_PREFERENCE,
  isThemePreference,
  resolveTheme,
  STORAGE_KEY,
  themeClass,
  type Theme,
  type ThemePreference,
} from "./theme";

type ThemeContextValue = {
  /** Resolved theme actually applied (system → marble/obsidian). */
  theme: Theme;
  /** What the user picked: marble | obsidian | system. */
  preference: ThemePreference;
  /** True once the client has synced with the html class set by the pre-paint script. */
  mounted: boolean;
  setPreference: (preference: ThemePreference) => void;
  /** Convenience flip between the two explicit themes (used by the top-bar toggle). */
  toggleTheme: () => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function readStoredPreference(): ThemePreference {
  if (typeof localStorage === "undefined") return DEFAULT_PREFERENCE;
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return isThemePreference(stored) ? stored : DEFAULT_PREFERENCE;
  } catch {
    return DEFAULT_PREFERENCE;
  }
}

function applyTheme(theme: Theme) {
  const el = document.documentElement;
  el.classList.add("theme-transitioning");
  el.classList.remove("theme-marble", "theme-obsidian");
  el.classList.add(themeClass(theme));
  el.style.colorScheme = theme === "obsidian" ? "dark" : "light";
  window.setTimeout(() => el.classList.remove("theme-transitioning"), 520);
}

const DEFAULT_THEME_FALLBACK: Theme = "marble";

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // SSR renders with the default; the pre-paint script has already set the real
  // class on the client, so we sync to it on mount to avoid a mismatch.
  const [preference, setPreferenceState] = useState<ThemePreference>(DEFAULT_PREFERENCE);
  const [theme, setThemeState] = useState<Theme>(DEFAULT_THEME_FALLBACK);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const pref = readStoredPreference();
    setPreferenceState(pref);
    setThemeState(resolveTheme(pref));
    setMounted(true);
  }, []);

  // When following the system, keep the applied theme in sync with OS changes live.
  useEffect(() => {
    if (preference !== "system" || typeof window === "undefined") return;
    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      const next = resolveTheme("system");
      setThemeState(next);
      applyTheme(next);
    };
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [preference]);

  const setPreference = useCallback((next: ThemePreference) => {
    setPreferenceState(next);
    const resolved = resolveTheme(next);
    setThemeState(resolved);
    applyTheme(resolved);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* storage may be unavailable (private mode); theme still applies for the session */
    }
  }, []);

  const toggleTheme = useCallback(() => {
    setPreference(resolveTheme(readStoredPreference()) === "obsidian" ? "marble" : "obsidian");
  }, [setPreference]);

  const value = useMemo<ThemeContextValue>(
    () => ({ theme, preference, mounted, setPreference, toggleTheme }),
    [theme, preference, mounted, setPreference, toggleTheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within <ThemeProvider>");
  return ctx;
}
