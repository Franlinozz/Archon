"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "./ThemeProvider";

/** Small icon toggle for the top utility bar. Flips between Marble and Obsidian. */
export function ThemeToggle({ className = "" }: { className?: string }) {
  const { theme, mounted, toggleTheme } = useTheme();
  const isObsidian = theme === "obsidian";
  const next = isObsidian ? "Marble (light)" : "Obsidian (dark)";

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={`Switch to ${next} theme`}
      title={`Switch to ${next} theme`}
      className={`grid h-8 w-8 place-items-center rounded-control border border-border-subtle bg-surface-2 text-text-mid hover:border-border-emphasis hover:text-green-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ring)] ${className}`}
    >
      {/* Render the glyph only after mount so SSR (which assumes the default
          theme) can't mismatch the client's real theme. */}
      {mounted ? (isObsidian ? <Sun size={15} /> : <Moon size={15} />) : <Sun size={15} className="opacity-0" />}
    </button>
  );
}
