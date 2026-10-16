import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Navbar } from "@/components/marketing/navbar";
import { Footer } from "@/components/marketing/footer";

/** Signed-in only, so never in a search index (sitemap.ts and robots.ts leave it out too). */
export const metadata: Metadata = { robots: { index: false, follow: false } };

/**
 * The user guides are for signed-in users (2026-10-16). Each page checks the session on the
 * server (./session.ts) after the proxy's own redirect, and the hub's ask box refuses
 * without one (./actions.ts).
 *
 * They keep the public site's chrome -- the landing theme, navbar and footer -- rather than
 * the app shell: a guide has nothing to do with whichever business happens to be selected,
 * and the navbar takes a reader back into the app in one click.
 */
export default function HelpLayout({ children }: { children: ReactNode }) {
  return (
    <div className="landing-theme flex min-h-screen flex-col bg-landing-bg text-landing-fg">
      <Navbar />
      <div className="flex-1">{children}</div>
      <Footer />
    </div>
  );
}
