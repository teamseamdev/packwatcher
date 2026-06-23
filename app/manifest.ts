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
        src: "/packwatch.png",
        sizes: "713x400",
        type: "image/png"
      }
    ]
  };
}
