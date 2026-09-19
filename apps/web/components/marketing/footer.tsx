import Link from "next/link";
import Image from "next/image";
import { Mail } from "lucide-react";
import { BRAND_LOCKUP } from "@cofounderai/core/brand/generated/assets";
import { BRAND_NAME } from "@cofounderai/core/lib/brand";

/** The one real, working piece of contact info this site has. Kept as constants rather
 * than inline literals since both appear in more than one place below (the CTA's href
 * and the footer's own visible website link). */
const CONTACT_EMAIL = "connect@wonderapps.biz";
const WEBSITE_HOST = "ark.WonderApps.biz";
const WEBSITE_URL = "https://ark.wonderapps.biz";

/** Real, working destinations only. Product/Modules links jump to sections already on
 * this page; Company/Legal pages (About, Blog, Privacy, Terms, Security) don't exist yet
 * -- rather than ship dead "#" links (CoFounderAI UI & CTA Enhancement doc §4: "remove or
 * clearly mark any CTA whose destination isn't implemented"), they're rendered as
 * non-interactive, clearly-muted "coming soon" text below instead of a clickable anchor.
 * "Contact" is the one exception: a real mailto CTA now that there's a real address to
 * send it to, so it's handled separately from this list rather than living in it. The
 * "Platform" column is likewise real: short factual statements about the architecture
 * (ADR-4/ADR-8/ADR-9/ADR-10), not marketing fluff, and not links to pages that don't
 * exist. */
const COLUMNS: { title: string; links: [string, string][] }[] = [
  {
    title: "Product",
    links: [
      ["Modules", "#modules"],
      ["How It Works", "#how-it-works"],
      ["Benefits", "#benefits"],
      ["Pricing", "#pricing"],
      ["FAQ", "#faq"],
      ["Help & Guides", "/help"],
    ],
  },
  {
    title: "Modules",
    links: [
      ["Discovery", "#module-discovery"],
      ["Inventory", "#module-inventory"],
      ["Service", "#module-service"],
      ["CRM", "#module-crm"],
      ["Finance", "#module-finance"],
    ],
  },
];

const PLATFORM_FACTS = [
  "Tenant-isolated at the database level, per business",
  "A module's data is visible only while it's licensed",
  "Cancelling a module keeps its data -- 30-day read-only grace, then paused, never deleted",
  "No hard dependencies between modules -- each degrades gracefully alone",
];

const COMING_SOON_COLUMNS: { title: string; items: string[] }[] = [
  { title: "Company", items: ["About", "Blog"] },
  { title: "Legal", items: ["Privacy", "Terms", "Security"] },
];

export function Footer() {
  return (
    <footer className="border-t border-landing-surface-border px-6 py-16">
      <div className="mx-auto max-w-6xl">
        <div className="grid grid-cols-2 gap-8 sm:grid-cols-6">
          <div className="col-span-2 sm:col-span-2">
            <Link href="/" aria-label={BRAND_NAME} className="inline-block">
              <Image
                {...BRAND_LOCKUP.onLight}
                alt={BRAND_NAME}
                className="h-7 w-auto"
              />
            </Link>
            <p className="mt-4 max-w-xs text-sm text-landing-muted">
              One portal, one login, five independently licensed modules for customer
              discovery, inventory, field service, CRM and GST compliance.
            </p>
            <p className="mt-4 text-xs font-semibold tracking-widest text-landing-muted/70 uppercase">
              Accelerate. Revenue. Knowledge.
            </p>
            <a
              href={WEBSITE_URL}
              className="mt-4 inline-block text-sm text-landing-muted hover:text-landing-fg"
            >
              {WEBSITE_HOST}
            </a>
          </div>
          {COLUMNS.map((column) => (
            <div key={column.title}>
              <p className="text-sm font-medium text-landing-fg">{column.title}</p>
              <ul className="mt-4 flex flex-col gap-2.5">
                {column.links.map(([label, href]) => (
                  <li key={label}>
                    {/* Anchors jump within this page; a real route navigates client-side. */}
                    {href.startsWith("#") ? (
                      <a href={href} className="text-sm text-landing-muted hover:text-landing-fg">
                        {label}
                      </a>
                    ) : (
                      <Link href={href} className="text-sm text-landing-muted hover:text-landing-fg">
                        {label}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
          {COMING_SOON_COLUMNS.map((column) => (
            <div key={column.title}>
              <p className="text-sm font-medium text-landing-fg">{column.title}</p>
              <ul className="mt-4 flex flex-col gap-2.5">
                {column.title === "Company" ? (
                  <li>
                    {/* The one real destination in this column -- a mailto CTA rather than
                     * the address itself, so nobody has to copy/retype it by hand. */}
                    <a
                      href={`mailto:${CONTACT_EMAIL}`}
                      className="inline-flex items-center gap-1.5 rounded-full border border-landing-surface-border bg-landing-surface px-3 py-1.5 text-sm font-medium text-landing-fg transition-colors hover:border-landing-accent hover:text-landing-accent"
                    >
                      <Mail className="size-3.5" aria-hidden="true" />
                      Email us
                    </a>
                  </li>
                ) : null}
                {column.items.map((label) => (
                  <li key={label}>
                    <span
                      className="text-sm text-landing-muted/50"
                      title="Coming soon"
                      aria-disabled="true"
                    >
                      {label}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-12 rounded-xl border border-landing-surface-border bg-landing-surface p-6">
          <p className="text-sm font-medium text-landing-fg">How the platform is built</p>
          <ul className="mt-3 grid grid-cols-1 gap-x-8 gap-y-2 sm:grid-cols-2">
            {PLATFORM_FACTS.map((fact) => (
              <li key={fact} className="flex items-start gap-2 text-sm text-landing-muted">
                <span className="mt-1.5 size-1 shrink-0 rounded-full bg-landing-accent" />
                {fact}
              </li>
            ))}
          </ul>
        </div>

        <div className="mt-10 flex flex-col gap-2 border-t border-landing-surface-border pt-8 text-xs text-landing-muted sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} {BRAND_NAME}. All rights reserved.</p>
          <p>Built as one modular platform -- not five products stitched together.</p>
        </div>
      </div>
    </footer>
  );
}
