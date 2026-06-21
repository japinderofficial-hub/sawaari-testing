import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "#050505",
        foreground: "#ffffff",
        primary: {
          DEFAULT: "#2563EB",
          dark: "#1D4ED8",
        },
        accent: {
          DEFAULT: "#FFB800",
        },
        muted: {
          DEFAULT: "#8E8E93",
        },
        border: {
          DEFAULT: "#1C1C1E",
        },
        card: {
          DEFAULT: "#0A0A0A",
        },
      },
    },
  },
  plugins: [],
};
export default config;
