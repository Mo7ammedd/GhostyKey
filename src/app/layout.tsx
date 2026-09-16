import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import "./globals.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { default: "GhostKey — Secrets that disappear.", template: "%s — GhostKey" },
  description: "Share sensitive information through temporary, encrypted links. Encrypted in your browser. No account required. Gone on your terms.",
  applicationName: "GhostKey",
  referrer: "no-referrer",
  robots: { index: true, follow: true },
  openGraph: { title: "GhostKey — Secrets that disappear.", description: "Private by design. Share temporary, end-to-end encrypted secret links.", type: "website", siteName: "GhostKey" },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#050505", colorScheme: "dark" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body className="font-sans antialiased"><a href="#main-content" className="skip-link">Skip to content</a><SiteHeader /><div id="main-content" className="app-content">{children}</div><SiteFooter /></body>
    </html>
  );
}
