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
        blue1: "#001a33",
        blue2: "#001e40",
        blue3: "#00264d",
        blue4: "#003c80",
        blue5: "#003366",
        blue6: "#005abf",
        blue7: "#335c85",
        blue8: "#0078ff",
        blue9: "#6685a3",
        blue10: "#3393ff",
        blue11: "#99adc2",
        blue12: "#66aeff",
        blue13: "#ccd6e0",
        blue14: "#99c9ff",
        blue15: "#cce4ff",
        gold: "#372908",
        gold1: "#6d5310",
        gold2: "#a37c18",
        gold3: "#daa520",
        gold4: "#e1b74d",
        gold5: "#e9c979",
        gold6: "#f0dba6",
        gold7: "#f8edd2",
        black: "#000000",
        gray1: "#1a1a1a",
        gray2: "#333333",
        gray3: "#4d4d4d",
        gray4: "#666666",
        gray5: "#808080",
        gray6: "#999999",
        gray7: "#b3b3b3",
        gray8: "#cccccc",
        gray9: "#e6e6e6",
        gray10: "#f2f2f2",
        white: "#ffffff",
      },
      fontFamily: {
        title: ["var(--font-archivo)"],
        body: ["var(--font-sansation)"],
      },
    },
  },
  plugins: [],
};

export default config;