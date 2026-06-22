import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "PackWatcher",
    short_name: "PackWatcher",
    description: "TCG restock alerts, inventory tracking, and profit management.",
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#090b10",
    theme_color: "#090b10",
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml"
      }
    ]
  };
}
