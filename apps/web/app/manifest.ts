import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Poof",
    short_name: "Poof",
    description: "Snap it. poof. Sold. An agent that prices, lists, haggles and plans the pickup for you.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f4f6f4",
    theme_color: "#f4f6f4",
    // The brand cloud on lime (design/visual/assets). New file names + ?v bust the old swing-tag icon that phones cached.
    icons: [
      { src: "/brand/icon-192.png?v=2", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/brand/icon-512.png?v=2", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/brand/icon-maskable-512.png?v=2", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
