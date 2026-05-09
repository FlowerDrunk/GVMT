import type { Config } from "tailwindcss";
import tailwindcssAnimate from "tailwindcss-animate";

const config = {
  darkMode: ["class", '[data-theme-resolved="dark"]'],
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      colors: {
        border: "var(--line)",
        input: "var(--line-strong)",
        ring: "var(--accent-ring)",
        background: "var(--body-bg)",
        foreground: "var(--text)",
        primary: {
          DEFAULT: "var(--accent)",
          foreground: "var(--text-on-accent)",
        },
        secondary: {
          DEFAULT: "var(--surface-muted)",
          foreground: "var(--text-soft)",
        },
        destructive: {
          DEFAULT: "var(--danger)",
          foreground: "var(--text-on-accent)",
        },
        muted: {
          DEFAULT: "var(--surface-muted)",
          foreground: "var(--muted)",
        },
        accent: {
          DEFAULT: "var(--accent-soft)",
          foreground: "var(--accent)",
        },
        popover: {
          DEFAULT: "var(--surface-glass-strong)",
          foreground: "var(--text)",
        },
        card: {
          DEFAULT: "var(--surface-strong)",
          foreground: "var(--text)",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
      },
    },
  },
  plugins: [tailwindcssAnimate],
} satisfies Config;

export default config;
