import type { MetadataRoute } from "next";
import { BRAND } from "@/lib/brand";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "InnerVerse",
    short_name: "InnerVerse",
    description: "Your personal Life Coach, always within reach.",
    // `id` distinguishes this PWA from any other app served at the
    // same origin. Required for Chrome's installable criteria;
    // omitting it can confuse the install heuristic.
    id: "/",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    lang: "en",
    theme_color: BRAND.dark,
    background_color: BRAND.dark,
    categories: ["health", "lifestyle"],
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
