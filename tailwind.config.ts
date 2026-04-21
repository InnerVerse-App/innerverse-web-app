import type { Config } from "tailwindcss";
import { BRAND } from "./src/lib/brand";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          primary: BRAND.primary,
          "primary-contrast": BRAND.primaryContrast,
          dark: BRAND.dark,
          text: BRAND.text,
          surface: BRAND.surface,
          destructive: BRAND.destructive,
          success: BRAND.success,
          alert: BRAND.alert,
        },
      },
    },
  },
  plugins: [],
};

export default config;
