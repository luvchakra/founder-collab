import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

// Matches co-founder-ai's own font choice (CLAUDE.md non-negotiable #7 governs colors
// and layout, not necessarily every upstream choice, but this one carries over: a single
// sans family throughout, per docs/DESIGN.md, rather than StockPilot's Space Grotesk/DM
// Sans display-font split).
const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "CoFounderAI Platform",
  description: "CoFounderAI — GTM, inventory, field service, CRM and GST in one portal.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
