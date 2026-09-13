import type { ReactNode } from "react";
import { BRAND_NAME } from "@cofounderai/core/lib/brand";
import { FadeIn } from "./fade-in";

function StepShell({
  index,
  title,
  body,
  children,
}: {
  index: number;
  title: string;
  body: string;
  children?: ReactNode;
}) {
  return (
    <FadeIn>
      <div className="grid grid-cols-1 items-center gap-8 rounded-2xl border border-landing-surface-border bg-landing-surface p-8 lg:grid-cols-2">
        <div>
          <span className="text-sm font-semibold text-landing-accent">Step {index}</span>
          <h3 className="mt-2 text-2xl font-semibold text-landing-fg">{title}</h3>
          <p className="mt-3 text-landing-muted">{body}</p>
        </div>
        {children}
      </div>
    </FadeIn>
  );
}

function OutputList({ items }: { items: string[] }) {
  return (
    <div className="rounded-xl border border-landing-surface-border bg-landing-bg-elevated p-5">
      <ul className="flex flex-col gap-2.5 text-sm text-landing-muted">
        {items.map((item) => (
          <li key={item} className="flex items-center gap-2">
            <span className="size-1.5 shrink-0 rounded-full bg-landing-accent" />
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function HowItWorks() {
  return (
    <section id="how-it-works" className="px-6 py-24">
      <div className="mx-auto max-w-5xl">
        <FadeIn>
          <h2 className="text-center text-3xl font-semibold tracking-tight text-landing-fg sm:text-4xl">
            How {BRAND_NAME} Works
          </h2>
        </FadeIn>

        <div className="mt-14 flex flex-col gap-6">
          <StepShell
            index={1}
            title="Create your business, once"
            body="One signup gives you one business record. Every module you license from here on reads and writes against that same business -- no separate account to set up per tool."
          >
            <OutputList items={["One login", "One business profile", "One team, one set of roles"]} />
          </StepShell>

          <StepShell
            index={2}
            title="License the modules you need today"
            body="Turn on Discovery, Inventory, Service, CRM and Compliance independently. Drop a module later without losing its data -- cancelling keeps everything, read-only, for 30 days before access is paused."
          >
            <OutputList
              items={["Discovery", "Inventory", "Service", "CRM", "Compliance"]}
            />
          </StepShell>

          <StepShell
            index={3}
            title="Your data connects itself"
            body="A customer discovered in Discovery is the same party record Service schedules a job for and CRM messages -- an item Inventory tracks is the same item a job invoice bills for. No CSV exports between tools."
          >
            <div className="rounded-xl border border-landing-surface-border bg-landing-bg-elevated p-5 text-sm">
              <div className="flex justify-between text-landing-muted">
                <span>Prospect wins in Discovery</span>
                <span className="text-landing-fg">→ Opportunity in Service</span>
              </div>
              <div className="mt-2 flex justify-between text-landing-muted">
                <span>Job consumes stock</span>
                <span className="text-landing-fg">→ Inventory updates</span>
              </div>
              <div className="mt-2 flex justify-between text-landing-muted">
                <span>Job is invoiced</span>
                <span className="text-landing-fg">→ Compliance has the sale</span>
              </div>
            </div>
          </StepShell>

          <StepShell
            index={4}
            title="Add a module later, on the same data"
            body="Growing into a new part of the business doesn't mean a new tool with a blank database. License the next module and it already knows your customers and your catalog."
          >
            <div className="rounded-xl border border-landing-surface-border bg-landing-bg-elevated p-5 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-medium text-landing-fg">Add Compliance</p>
                <span className="rounded-full bg-landing-accent px-4 py-1.5 text-xs font-medium whitespace-nowrap text-landing-accent-foreground">
                  Activate
                </span>
              </div>
              <p className="mt-3 text-landing-muted">
                Your existing sales orders and invoices are already there -- GST filing
                starts from day one, not from zero.
              </p>
            </div>
          </StepShell>
        </div>
      </div>
    </section>
  );
}
