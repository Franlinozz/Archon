import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        canvas: "var(--canvas)", "surface-1": "var(--surface-1)", "surface-2": "var(--surface-2)", "surface-3": "var(--surface-3)", terminal: "var(--terminal)", "code-surface": "var(--code-surface)",
        "border-subtle": "var(--border-subtle)", "border-emphasis": "var(--border-emphasis)", ring: "var(--ring)",
        // legacy aliases (kept so existing components keep working; now theme-driven)
        "green-500": "var(--green-500)", "green-400": "var(--green-400)", "green-300": "var(--green-300)", "on-green": "var(--on-green)",
        "text-hi": "var(--text-hi)", "text-mid": "var(--text-mid)", "text-low": "var(--text-low)", "text-code": "var(--text-code)",
        // canonical Session-1 tokens
        ink: "var(--ink)", body: "var(--body)", muted: "var(--muted)", "on-brand": "var(--on-brand)",
        "brand-50": "var(--brand-50)", "brand-100": "var(--brand-100)", "brand-200": "var(--brand-200)", "brand-300": "var(--brand-300)", "brand-400": "var(--brand-400)", "brand-500": "var(--brand-500)", "brand-600": "var(--brand-600)", "brand-700": "var(--brand-700)",
        danger: "var(--danger)", "danger-bg": "var(--danger-bg)", high: "var(--high)", warning: "var(--warning)", "warning-bg": "var(--warning-bg)", success: "var(--success)", "success-bg": "var(--success-bg)", info: "var(--info)", "info-bg": "var(--info-bg)"
      },
      boxShadow: { sm: "var(--shadow-sm)", card: "var(--shadow-card)", lift: "var(--shadow-lift)", "glow-brand": "var(--glow-brand)" },
      fontFamily: { display: ["var(--font-display)", "Inter", "sans-serif"], ui: ["var(--font-ui)", "Inter", "sans-serif"], mono: ["var(--font-mono)", "monospace"] },
      // Obsidian type scale — deliberately reduced for a dense operator console. Overrides
      // Tailwind's oversized defaults app-wide through the existing utility classes, so the
      // UI fits at 100% zoom on a 1440px screen. Negative tracking on display sizes only.
      fontSize: {
        xs: ["12px", { lineHeight: "1.45" }],      // meta / eyebrows
        sm: ["13px", { lineHeight: "1.5" }],       // small body, mono data, table cells
        base: ["14px", { lineHeight: "1.55" }],    // body
        lg: ["15px", { lineHeight: "1.5" }],       // lede / emphasized body
        xl: ["18px", { lineHeight: "1.4" }],       // H2
        "2xl": ["20px", { lineHeight: "1.3" }],
        "3xl": ["24px", { lineHeight: "1.2", letterSpacing: "-0.01em" }],   // large section header
        "4xl": ["28px", { lineHeight: "1.15", letterSpacing: "-0.02em" }],  // H1 page titles
        "5xl": ["32px", { lineHeight: "1.1", letterSpacing: "-0.02em" }],
        "6xl": ["38px", { lineHeight: "1.07", letterSpacing: "-0.03em" }],
        "7xl": ["44px", { lineHeight: "1.05", letterSpacing: "-0.03em" }],  // hero
      },
      borderRadius: { card: "var(--r-card)", control: "var(--r-input)", pill: "var(--r-chip)" }
    }
  },
  safelist: [
    { pattern: /(bg|text|border)-(danger|high|warning|success|info)/ },
    { pattern: /(bg|text|border)-(danger|warning|success|info)-bg/ },
    { pattern: /(bg|text|border)-green-(300|400|500)/ },
    { pattern: /(bg|text|border)-brand-(50|100|200|300|400|500|600|700)/ }
  ],
  plugins: [require("@tailwindcss/forms")]
};
export default config;
