import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "PackWatcher",
    short_name: "PackWatcher",
    description: "TCG restock alerts, inventory tracking, and profit management.",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    background_color: "#090b10",
    theme_color: "#090b10",
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any"
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any"
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable"
      }
    ]
  };
}
