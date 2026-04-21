import type { MetadataRoute } from "next";
import { BRAND } from "@/lib/brand";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "InnerVerse",
    description: "Your personal Life Coach, always within reach.",
    start_url: "/",
    display: "standalone",
    theme_color: BRAND.dark,
    background_color: BRAND.dark,
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
