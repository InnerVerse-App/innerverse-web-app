import type { Config } from "tailwindcss";
import { BRAND } from "./src/lib/brand";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        brand: BRAND,
      },
    },
  },
  plugins: [],
};

export default config;
