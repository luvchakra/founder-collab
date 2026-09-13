import { BRAND_NAME } from "@cofounderai/core/lib/brand";
import { FadeIn } from "./fade-in";

const BEFORE = [
  "A CRM for conversations",
  "A separate inventory spreadsheet",
  "A scheduling app for the crew",
  "A GST filing checklist on the side",
  "Customer data copied between all four",
  "Nobody fully trusts any of it",
];

const AFTER = [
  "One login for the whole business",
  "One customer record, every module",
  "One item, one stock count, everywhere",
  "Jobs, invoices and stock reservations linked automatically",
  "GST filings built from the same sales data",
  "License only what you need, add modules later",
];

function Path({
  title,
  steps,
  accent,
}: {
  title: string;
  steps: string[];
  accent: boolean;
}) {
  return (
    <div
      className={`rounded-xl border p-6 ${
        accent
          ? "border-landing-accent/30 bg-landing-accent/[0.06]"
          : "border-landing-surface-border bg-landing-surface"
      }`}
    >
      <p
        className={`text-xs font-semibold tracking-widest uppercase ${
          accent ? "text-landing-accent" : "text-landing-muted"
        }`}
      >
        {title}
      </p>
      <ol className="mt-4 flex flex-col gap-2">
        {steps.map((step, i) => (
          <li key={step} className="flex items-center gap-3 text-sm">
            <span
              className={`flex size-5 shrink-0 items-center justify-center rounded-full text-[10px] font-medium ${
                accent
                  ? "bg-landing-accent text-landing-accent-foreground"
                  : "bg-landing-fg/10 text-landing-muted"
              }`}
            >
              {i + 1}
            </span>
            <span className={accent ? "text-landing-fg" : "text-landing-muted"}>{step}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

export function Transformation() {
  return (
    <section className="px-6 py-24">
      <div className="mx-auto max-w-6xl">
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <FadeIn>
            <Path title="Five separate tools" steps={BEFORE} accent={false} />
          </FadeIn>
          <FadeIn delayMs={100}>
            <Path title={BRAND_NAME} steps={AFTER} accent />
          </FadeIn>
        </div>

        <FadeIn delayMs={200}>
          <p className="mt-12 text-balance text-center text-2xl font-medium text-landing-fg sm:text-3xl">
            From five logins and five copies of the truth to one platform that already
            agrees with itself.
          </p>
        </FadeIn>
      </div>
    </section>
  );
}
