"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { DEFAULT_THEME, STORAGE_KEY, themeClass, type Theme } from "./theme";

type ThemeContextValue = {
  theme: Theme;
  /** True once the client has synced with the html class set by the pre-paint script. */
  mounted: boolean;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function readDomTheme(): Theme {
  if (typeof document === "undefined") return DEFAULT_THEME;
  return document.documentElement.classList.contains("theme-obsidian") ? "obsidian" : "marble";
}

function applyTheme(theme: Theme) {
  const el = document.documentElement;
  el.classList.remove("theme-marble", "theme-obsidian");
  el.classList.add(themeClass(theme));
  el.style.colorScheme = theme === "obsidian" ? "dark" : "light";
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // SSR renders with the default; the pre-paint script has already set the real
  // class on the client, so we sync to it on mount to avoid a mismatch.
  const [theme, setThemeState] = useState<Theme>(DEFAULT_THEME);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setThemeState(readDomTheme());
    setMounted(true);
  }, []);

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
    applyTheme(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* storage may be unavailable (private mode); theme still applies for the session */
    }
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme(readDomTheme() === "obsidian" ? "marble" : "obsidian");
  }, [setTheme]);

  const value = useMemo<ThemeContextValue>(
    () => ({ theme, mounted, setTheme, toggleTheme }),
    [theme, mounted, setTheme, toggleTheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within <ThemeProvider>");
  return ctx;
}
