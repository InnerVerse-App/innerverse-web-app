// Canonical InnerVerse brand palette. Reference: reference/logos/app-colors.png
// (MOB palette, commit 41335d4). Tailwind config imports these values so
// Tailwind utilities and TypeScript consumers (manifest, viewport) stay in sync.

export const BRAND = {
  primary: "#59A4C0",
  primaryContrast: "#FFFFFF",
  dark: "#00050A",
  text: "#0F172A",
  surface: "#FFFFFF",
  destructive: "#B0200C",
  success: "#1E6C30",
  alert: "#DCA114",
} as const;
