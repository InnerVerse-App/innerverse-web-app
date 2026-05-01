import type { Metadata, Viewport } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { SpeedInsights } from "@vercel/speed-insights/next";

import { PWARegister } from "@/app/_components/PWARegister";
import { BRAND } from "@/lib/brand";
import "./globals.css";

export const metadata: Metadata = {
  title: "InnerVerse",
  description: "Your personal Life Coach, always within reach.",
  // iOS Safari ignores the manifest for standalone-display purposes
  // and reads these meta tags instead. Without them, "Add to Home
  // Screen" on iOS opens InnerVerse inside Safari chrome rather
  // than as a real installed app.
  appleWebApp: {
    capable: true,
    title: "InnerVerse",
    statusBarStyle: "black-translucent",
  },
};

export const viewport: Viewport = {
  themeColor: BRAND.dark,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ClerkProvider>
      <html lang="en" className="bg-brand-dark">
        <body
          className="antialiased bg-brand-dark text-neutral-200"
          suppressHydrationWarning
        >
          {children}
          <PWARegister />
          <SpeedInsights />
        </body>
      </html>
    </ClerkProvider>
  );
}
