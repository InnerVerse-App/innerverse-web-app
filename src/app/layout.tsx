import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "InnerVerse",
  description: "Your personal Life Coach, always within reach.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased" suppressHydrationWarning>{children}</body>
    </html>
  );
}
