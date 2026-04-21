import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "InnerVerse",
    description: "Your personal Life Coach, always within reach.",
    start_url: "/",
    display: "standalone",
    theme_color: "#00050A",
    background_color: "#00050A",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
