import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        canvas: "var(--canvas)", "surface-1": "var(--surface-1)", "surface-2": "var(--surface-2)", "surface-3": "var(--surface-3)", terminal: "var(--terminal)",
        "border-subtle": "var(--border-subtle)", "border-emphasis": "var(--border-emphasis)", "green-500": "var(--green-500)", "green-400": "var(--green-400)", "green-300": "var(--green-300)", "on-green": "var(--on-green)",
        "text-hi": "var(--text-hi)", "text-mid": "var(--text-mid)", "text-low": "var(--text-low)", "text-code": "var(--text-code)", danger: "var(--danger)", high: "var(--high)", warning: "var(--warning)", success: "var(--success)", info: "var(--info)"
      },
      fontFamily: { display: ["var(--font-display)", "Inter", "sans-serif"], ui: ["var(--font-ui)", "Inter", "sans-serif"], mono: ["var(--font-mono)", "monospace"] },
      borderRadius: { card: "14px", control: "10px", pill: "999px" }
    }
  },
  safelist: [
    { pattern: /(bg|text|border)-(danger|high|warning|success|info)/ },
    { pattern: /(bg|text|border)-green-(300|400|500)/ }
  ],
  plugins: [require("@tailwindcss/forms")]
};
export default config;
