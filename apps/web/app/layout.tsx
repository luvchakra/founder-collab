import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Suspense } from "react";
import { Inter, Geist_Mono } from "next/font/google";
import { SITE_URL } from "@cofounderai/core/site";
import { BRAND_NAME } from "@cofounderai/core/lib/brand";
import {
  BRAND_DESCRIPTION,
  BRAND_METADATA_ICONS,
  BRAND_THEME_COLOR,
  BRAND_TITLE,
  BRAND_TITLE_TEMPLATE,
} from "@cofounderai/core/brand/identity";
import { ThemeProvider } from "@cofounderai/core/theme/theme-provider";
import { ThemeScript } from "@cofounderai/core/theme/theme-script";
import { TopProgressBar } from "@cofounderai/core/navigation/top-progress-bar";
import { Toaster } from "@cofounderai/core/ui/sonner";
import { InstallBanner } from "@/components/install-banner/install-banner";
import { InstallPromptCaptureScript } from "@/components/install-banner/install-prompt-capture-script";
import "./globals.css";

// Inter, the WonderArk brand typeface (docs/plan/16-BRANDING-BACKLOG.md §4): a single
// sans family throughout, per docs/DESIGN.md. Mono stays Geist Mono for code and IDs.
const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

// BRAND-07: "WonderArk — Business in One Place", "{Page} | WonderArk". The Open Graph /
// Twitter image is app/opengraph-image.png, which Next attaches on its own.
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: BRAND_TITLE, template: BRAND_TITLE_TEMPLATE },
  description: BRAND_DESCRIPTION,
  applicationName: BRAND_NAME,
  icons: BRAND_METADATA_ICONS,
  openGraph: { type: "website", siteName: BRAND_NAME, title: BRAND_TITLE, description: BRAND_DESCRIPTION },
  twitter: { card: "summary", title: BRAND_TITLE, description: BRAND_DESCRIPTION },
  // BRAND-13: Add to Home Screen on iOS/iPadOS -- the home-screen name, a light status bar
  // over the app, and the legacy capable flag (Next emits only `mobile-web-app-capable`).
  appleWebApp: { capable: true, title: BRAND_NAME, statusBarStyle: "default" },
  other: { "apple-mobile-web-app-capable": "yes" },
};

export const viewport: Viewport = { themeColor: BRAND_THEME_COLOR };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${inter.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <ThemeScript />
        <InstallPromptCaptureScript />
      </head>
      <body className="min-h-full flex flex-col">
        <Suspense fallback={null}>
          <TopProgressBar />
        </Suspense>
        <ThemeProvider>
          {/* BRAND-13: first in the body, so it sits above every header and pushes it down. */}
          <InstallBanner />
          {children}
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
