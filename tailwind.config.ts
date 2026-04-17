import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{js,ts,jsx,tsx,mdx}", "./components/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        bg: "#05050A",
        panel: "#0B1020",
        accent: "#A855F7"
      }
    }
  },
  plugins: []
};

export default config;
