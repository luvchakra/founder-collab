import { Check, X } from "lucide-react";
import { BRAND_NAME } from "@cofounderai/core/lib/brand";
import { FadeIn } from "./fade-in";

const ROWS: [string, string][] = [
  ["Five separate logins", "One login for the whole business"],
  ["Customer data copied between tools", "One customer record, shared by every module"],
  ["Stock counts that drift apart", "One inventory number, read everywhere"],
  ["A CSV export/import routine to connect tools", "No exports -- the data was never separate"],
  ["A new tool starts from an empty database", "A new module starts from your existing data"],
  ["GST filing re-keyed from a spreadsheet", "GST filing computed from your real sales data"],
  ["A bundle of unrelated apps", "One platform, five licensable modules"],
];

export function Differentiation() {
  return (
    <section className="px-6 py-24">
      <div className="mx-auto max-w-4xl">
        <FadeIn>
          <div className="text-center">
            <h2 className="text-3xl font-semibold tracking-tight text-landing-fg sm:text-4xl">
              Not five apps stitched together with exports.
            </h2>
            <p className="mt-4 text-lg text-landing-muted">
              {BRAND_NAME} is one platform with five licensable modules on one shared
              data model.
            </p>
          </div>
        </FadeIn>

        <FadeIn delayMs={150}>
          <div className="mt-12 overflow-hidden rounded-2xl border border-landing-surface-border">
            <div className="grid grid-cols-2 bg-landing-bg-elevated text-sm font-medium">
              <div className="px-6 py-4 text-landing-muted">A pile of separate tools</div>
              <div className="border-l border-landing-surface-border px-6 py-4 text-landing-accent">
                {BRAND_NAME}
              </div>
            </div>
            {ROWS.map(([before, after], i) => (
              <div
                key={before}
                className={`grid grid-cols-2 text-sm ${i % 2 === 0 ? "bg-landing-surface" : "bg-landing-bg-elevated/40"}`}
              >
                <div className="flex items-center gap-2 px-6 py-4 text-landing-muted">
                  <X className="size-4 shrink-0 text-landing-muted/70" aria-hidden="true" />
                  {before}
                </div>
                <div className="flex items-center gap-2 border-l border-landing-surface-border px-6 py-4 text-landing-fg">
                  <Check className="size-4 shrink-0 text-landing-accent" aria-hidden="true" />
                  {after}
                </div>
              </div>
            ))}
          </div>
        </FadeIn>

        <FadeIn delayMs={250}>
          <p className="mt-10 text-balance text-center text-xl font-medium text-landing-fg">
            The goal isn&apos;t another tool. It&apos;s one platform that already agrees
            with itself.
          </p>
        </FadeIn>
      </div>
    </section>
  );
}
