import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        p0: "#dc2626",
        p1: "#ea580c",
        p2: "#ca8a04",
        p3: "#6b7280",
      },
      fontFamily: {
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      keyframes: {
        "fade-in": {
          "0%": { opacity: "0", transform: "translateY(4px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "pulse-border": {
          "0%, 100%": { borderColor: "rgba(59,130,246,0.4)" },
          "50%": { borderColor: "rgba(59,130,246,0.9)" },
        },
      },
      animation: {
        "fade-in": "fade-in 0.35s ease-out",
        "pulse-border": "pulse-border 1.4s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
