import type { Metadata, Viewport } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { BRAND } from "@/lib/brand";
import "./globals.css";

export const metadata: Metadata = {
  title: "InnerVerse",
  description: "Your personal Life Coach, always within reach.",
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
        </body>
      </html>
    </ClerkProvider>
  );
}
