import Link from "next/link";
import Image from "next/image";

/** Real, working destinations only. Product links jump to sections already on this page;
 * Company/Legal pages (About, Contact, Blog, Privacy, Terms, Security) don't exist yet --
 * rather than ship dead "#" links (CoFounderAI UI & CTA Enhancement doc §4: "remove or
 * clearly mark any CTA whose destination isn't implemented"), they're rendered as
 * non-interactive, clearly-muted "coming soon" text below instead of a clickable anchor. */
const COLUMNS: { title: string; links: [string, string][] }[] = [
  {
    title: "Product",
    links: [
      ["How It Works", "#how-it-works"],
      ["Features", "#benefits"],
      ["Pricing", "#pricing"],
      ["FAQ", "#faq"],
    ],
  },
];

const COMING_SOON_COLUMNS: { title: string; items: string[] }[] = [
  { title: "Company", items: ["About", "Contact", "Blog"] },
  { title: "Legal", items: ["Privacy", "Terms", "Security"] },
];

export function Footer() {
  return (
    <footer className="border-t border-landing-surface-border px-6 py-16">
      <div className="mx-auto grid max-w-6xl grid-cols-2 gap-8 sm:grid-cols-4">
        <div className="col-span-2 sm:col-span-1">
          <Link href="/" aria-label="CoFounderAI" className="inline-block">
            <Image
              src="/logo-lockup.png"
              alt="CoFounderAI"
              width={1583}
              height={350}
              className="h-7 w-auto"
            />
          </Link>
        </div>
        {COLUMNS.map((column) => (
          <div key={column.title}>
            <p className="text-sm font-medium text-landing-fg">{column.title}</p>
            <ul className="mt-4 flex flex-col gap-2.5">
              {column.links.map(([label, href]) => (
                <li key={label}>
                  <a href={href} className="text-sm text-landing-muted hover:text-landing-fg">
                    {label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ))}
        {COMING_SOON_COLUMNS.map((column) => (
          <div key={column.title}>
            <p className="text-sm font-medium text-landing-fg">{column.title}</p>
            <ul className="mt-4 flex flex-col gap-2.5">
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
      <p className="mx-auto mt-12 max-w-6xl text-xs text-landing-muted">© CoFounderAI</p>
    </footer>
  );
}
