// Shared theme constants used by both the pre-paint script and the provider.
// Keep this dependency-free so the inline no-flash script can mirror its logic.

export type Theme = "marble" | "obsidian";

export const THEMES: Theme[] = ["marble", "obsidian"];
export const DEFAULT_THEME: Theme = "marble";
export const STORAGE_KEY = "archon-theme";

export function themeClass(theme: Theme): string {
  return `theme-${theme}`;
}

/**
 * Inline script injected into <head> and run before first paint. It reads the
 * stored choice (or falls back to prefers-color-scheme, then marble) and sets
 * the html class + color-scheme so there is no white→dark flash on reload.
 * Must stay self-contained — no imports, no module references.
 */
export const NO_FLASH_SCRIPT = `(function(){try{var k="${STORAGE_KEY}";var s=localStorage.getItem(k);var t=(s==="obsidian"||s==="marble")?s:((window.matchMedia&&window.matchMedia("(prefers-color-scheme: dark)").matches)?"obsidian":"marble");var el=document.documentElement;el.classList.remove("theme-marble","theme-obsidian");el.classList.add("theme-"+t);el.style.colorScheme=(t==="obsidian")?"dark":"light";}catch(e){}})();`;
