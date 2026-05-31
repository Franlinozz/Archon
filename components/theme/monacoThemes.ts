import type { Monaco } from "@monaco-editor/react";
import type { Theme } from "./theme";

// Monaco can't read CSS custom properties, so these mirror the Marble/Obsidian
// --code-surface / --ink / --muted tokens as concrete hexes. Keep in sync with
// globals.css if those token values change.
export function defineArchonMonacoThemes(monaco: Monaco) {
  monaco.editor.defineTheme("archon-light", {
    base: "vs",
    inherit: true,
    rules: [
      { token: "comment", foreground: "6B7A73", fontStyle: "italic" },
      { token: "keyword", foreground: "0A6647" },
      { token: "string", foreground: "0E815A" },
      { token: "number", foreground: "2563EB" },
      { token: "type", foreground: "0B1A14" },
    ],
    colors: {
      "editor.background": "#FBFDFC",
      "editor.foreground": "#0B1A14",
      "editorLineNumber.foreground": "#6B7A73",
      "editorLineNumber.activeForeground": "#0B1A14",
      "editor.selectionBackground": "#C2E5D5",
      "editor.lineHighlightBackground": "#EEF4F0",
    },
  });
  monaco.editor.defineTheme("archon-dark", {
    base: "vs-dark",
    inherit: true,
    rules: [],
    colors: {
      "editor.background": "#070908",
      "editor.foreground": "#C8D2CC",
      "editorLineNumber.foreground": "#6B756F",
      "editor.lineHighlightBackground": "#10150F",
    },
  });
}

export function archonMonacoTheme(theme: Theme): "archon-dark" | "archon-light" {
  return theme === "obsidian" ? "archon-dark" : "archon-light";
}
