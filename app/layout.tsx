import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PackWatcher | Never Miss a Restock.",
  description: "Real-time TCG restock alerts, inventory tracking, and profit management for serious collectors.",
  manifest: "/manifest.json"
};

export const viewport: Viewport = {
  themeColor: "#090b10",
  width: "device-width",
  initialScale: 1
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
