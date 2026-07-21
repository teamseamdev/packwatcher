import type { Metadata, Viewport } from "next";
import { LegalFooter } from "@/components/legal-footer";
import { MobileViewportLock } from "@/components/mobile-viewport-lock";
import "./globals.css";

export const metadata: Metadata = {
  title: "PackWatcher | Never Miss a Restock.",
  description: "Real-time TCG restock alerts, inventory tracking, and profit management for serious collectors.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "PackWatcher",
    statusBarStyle: "black-translucent"
  },
  icons: {
    icon: [
      { url: "/favicon.png", sizes: "32x32", type: "image/png" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" }
    ],
    apple: "/icons/apple-touch-icon.png"
  }
};

export const viewport: Viewport = {
  themeColor: "#050507",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <MobileViewportLock />
        {children}
        <LegalFooter />
      </body>
    </html>
  );
}
