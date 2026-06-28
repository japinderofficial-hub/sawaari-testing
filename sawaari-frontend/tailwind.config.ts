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
        background: "#090909",
        foreground: "#ffffff",
        primary: {
          DEFAULT: "#2563EB",
          dark: "#1D4ED8",
        },
        accent: {
          DEFAULT: "#FACC15",
        },
        muted: {
          DEFAULT: "#A3A3A3",
        },
        border: {
          DEFAULT: "#252525",
        },
        card: {
          DEFAULT: "#141414",
        },
      },
    },
  },
  plugins: [],
};
export default config;
