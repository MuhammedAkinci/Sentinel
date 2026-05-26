import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        background: "#0A0A0A",
        foreground: "#F0F0F0",
        primary: "#00FF88",
        muted: "#1A1A1A",
        "muted-foreground": "#666666",
        border: "#1A1A1A",
        danger: "#FF3366",
      },
      fontFamily: {
        sans: ["var(--font-space-grotesk)", "system-ui", "sans-serif"],
        mono: ["var(--font-jetbrains-mono)", "ui-monospace", "monospace"],
      },
      borderRadius: {
        none: "0px",
        sm: "2px",
        DEFAULT: "4px",
      },
      letterSpacing: {
        tightest: "-0.06em",
        tighter: "-0.04em",
      },
      keyframes: {
        "pulse-dot": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.3" },
        },
        "shimmer-in": {
          from: { opacity: "0", transform: "translateY(8px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        "pulse-dot": "pulse-dot 2s ease-in-out infinite",
        "shimmer-in": "shimmer-in 320ms cubic-bezier(0.16, 1, 0.3, 1)",
      },
    },
  },
  plugins: [],
};

export default config;
