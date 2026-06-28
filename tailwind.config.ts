import type { Config } from "tailwindcss";
import { tailwindColors } from "./src/theme/tailwindColors";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: tailwindColors,
      fontFamily: {
        title: ["var(--font-archivo)"],
        body: ["var(--font-sansation)"],
      },
    },
  },
  plugins: [],
};

export default config;
