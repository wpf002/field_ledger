import type { Config } from "tailwindcss";

// Locked design tokens (see /docs spec). Map screenshots 1:1.
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "var(--bg)",
        surface: "var(--surface)",
        "surface-sunken": "var(--surface-sunken)",
        border: "var(--border)",
        primary: { DEFAULT: "var(--primary)", deep: "var(--primary-deep)" },
        brown: "var(--brown)",
        rust: "var(--rust)",
        gold: "var(--gold)",
        ink: "var(--text)",
        muted: "var(--text-muted)",
        positive: "var(--positive)",
        negative: "var(--negative)",
        tag: "var(--tag-bg)",
        mint: "var(--mint)",
        "cream-tint": "var(--cream-tint)",
      },
      borderRadius: { card: "var(--radius-card)", btn: "var(--radius-btn)", pill: "var(--radius-pill)" },
      fontFamily: {
        serif: ["var(--font-serif)", "Georgia", "serif"],
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
      },
      boxShadow: { card: "0 1px 2px rgba(43,43,38,0.04), 0 1px 3px rgba(43,43,38,0.06)" },
    },
  },
  plugins: [],
};
export default config;
