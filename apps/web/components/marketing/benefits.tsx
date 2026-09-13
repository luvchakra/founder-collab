import { Users, Boxes, CalendarClock, Inbox, ReceiptText, Layers } from "lucide-react";
import { FadeIn } from "./fade-in";

const BENEFITS = [
  {
    icon: Users,
    title: "One customer record",
    body: "A party discovered, sold to, serviced and messaged is the same record everywhere -- never three half-matching profiles.",
  },
  {
    icon: Boxes,
    title: "One stock count",
    body: "What a job consumes, a sales order sells, and Compliance reports on all come from the same inventory number.",
  },
  {
    icon: CalendarClock,
    title: "Jobs that bill themselves correctly",
    body: "Parts used on a job are already the parts your invoice and your stock levels agree on.",
  },
  {
    icon: Inbox,
    title: "One inbox, every channel",
    body: "WhatsApp, email and every other channel land in one place, tied to the customer record every other module already has.",
  },
  {
    icon: ReceiptText,
    title: "Compliance from real data",
    body: "GST filings are computed from the sales you already recorded -- not re-typed from a spreadsheet at month end.",
  },
  {
    icon: Layers,
    title: "Add modules without a migration",
    body: "License a new module later and it starts from your existing customers and catalog, not an empty database.",
  },
];

export function Benefits() {
  return (
    <section id="benefits" className="px-6 py-24">
      <div className="mx-auto max-w-6xl">
        <FadeIn>
          <h2 className="max-w-2xl text-balance text-3xl font-semibold tracking-tight text-landing-fg sm:text-4xl">
            A platform that never has to be reconciled with itself.
          </h2>
        </FadeIn>

        <div className="mt-12 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {BENEFITS.map((benefit, i) => (
            <FadeIn key={benefit.title} delayMs={i * 75}>
              <div className="h-full rounded-xl border border-landing-surface-border bg-landing-surface p-6">
                <benefit.icon className="size-5 text-landing-accent" aria-hidden="true" />
                <p className="mt-4 font-medium text-landing-fg">{benefit.title}</p>
                <p className="mt-2 text-sm text-landing-muted">{benefit.body}</p>
              </div>
            </FadeIn>
          ))}
        </div>
      </div>
    </section>
  );
}
