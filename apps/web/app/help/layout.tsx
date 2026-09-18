import type { ReactNode } from "react";
import { Navbar } from "@/components/marketing/navbar";
import { Footer } from "@/components/marketing/footer";

/**
 * The user guides are public, and they wear the public site's clothes: the same landing
 * theme, the same navbar, the same footer.
 *
 * Public because the person who most needs the documentation is often the one who cannot
 * get in — a founder locked out of their account, someone deciding whether to sign up at
 * all, or a team member sent a link to one section. Putting it behind the login it
 * explains would be a circular door. Nothing on these pages reads tenant data; the
 * content is our own product documentation, identical for every visitor.
 *
 * Signed-in visitors reach the same URLs from the avatar menu and keep the marketing
 * chrome. That is deliberate rather than an oversight: the alternative is rendering the
 * whole app shell around a page that has nothing to do with the business they happen to
 * have selected, and the navbar's own links take them back in one click.
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
