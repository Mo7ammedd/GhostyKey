import type { Metadata } from "next";
import type { ReactNode } from "react";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "GhostKey — Secrets that disappear.",
  description: "Share sensitive information through temporary, encrypted links.",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en" className={[GeistSans.variable, GeistMono.variable].join(" ")}>
      <body>{children}</body>
    </html>
  );
}
