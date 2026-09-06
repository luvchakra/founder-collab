import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Suspense } from "react";
import { Geist, Geist_Mono } from "next/font/google";
import { SITE_URL } from "@cofounderai/core/site";
import { ThemeProvider } from "@cofounderai/core/theme/theme-provider";
import { ThemeScript } from "@cofounderai/core/theme/theme-script";
import { TopProgressBar } from "@cofounderai/core/navigation/top-progress-bar";
import "./globals.css";

// Matches co-founder-ai's own font choice (CLAUDE.md non-negotiable #7 governs colors
// and layout, not necessarily every upstream choice, but this one carries over: a single
// sans family throughout, per docs/DESIGN.md, rather than StockPilot's Space Grotesk/DM
// Sans display-font split).
const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

const TITLE = "CoFounderAI Platform";
const DESCRIPTION = "CoFounderAI — GTM, inventory, field service, CRM and GST in one portal.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: TITLE, template: "%s — CoFounderAI" },
  description: DESCRIPTION,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <ThemeScript />
      </head>
      <body className="min-h-full flex flex-col">
        <Suspense fallback={null}>
          <TopProgressBar />
        </Suspense>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
