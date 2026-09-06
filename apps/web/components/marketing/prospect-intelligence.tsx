import { FadeIn } from "./fade-in";
import { AnimatedScore } from "./animated-score";

const SUB_SCORES: [string, number][] = [
  ["ICP Fit", 94],
  ["Intent", 87],
  ["Timing", 91],
  ["Reachability", 95],
];

export function ProspectIntelligence() {
  return (
    <section className="px-6 py-24">
      <div className="mx-auto max-w-5xl">
        <FadeIn>
          <h2 className="max-w-2xl text-balance text-3xl font-semibold tracking-tight text-landing-fg sm:text-4xl">
            One prospect at a time.
          </h2>
        </FadeIn>

        <FadeIn delayMs={150}>
          <div className="landing-glow mt-12 rounded-2xl border border-landing-surface-border bg-landing-bg-elevated p-6 sm:p-8">
            <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_1.3fr]">
              <div>
                <p className="text-lg font-medium text-landing-fg">Acme Technologies</p>
                <p className="mt-1 text-sm text-landing-muted">
                  Overall Score:{" "}
                  <span className="font-semibold text-landing-accent">
                    <AnimatedScore target={92} />
                    /100
                  </span>
                </p>

                <dl className="mt-6 grid grid-cols-2 gap-4">
                  {SUB_SCORES.map(([label, value]) => (
                    <div key={label}>
                      <dt className="text-xs text-landing-muted">{label}</dt>
                      <dd className="mt-1 text-2xl font-semibold text-landing-fg">
                        <AnimatedScore target={value} />
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>

              <div className="flex flex-col gap-4 rounded-xl border border-landing-surface-border bg-landing-surface p-5 text-sm">
                <div>
                  <p className="font-medium text-landing-fg">Why This Prospect?</p>
                  <p className="mt-1 text-landing-muted">
                    &ldquo;Acme matches your target profile and recently expanded its
                    engineering organization.&rdquo;
                  </p>
                </div>
                <div>
                  <p className="font-medium text-landing-fg">Why Now?</p>
                  <p className="mt-1 text-landing-muted">
                    &ldquo;Recent hiring and product expansion suggest an active
                    technology investment cycle.&rdquo;
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="font-medium text-landing-fg">Who To Contact?</p>
                    <p className="mt-1 text-landing-muted">Sarah Miller</p>
                    <p className="text-landing-muted">VP Engineering</p>
                  </div>
                  <div>
                    <p className="font-medium text-landing-fg">Channel</p>
                    <p className="mt-1 text-landing-muted">Email</p>
                  </div>
                </div>
                <div>
                  <p className="font-medium text-landing-fg">Recommended Angle</p>
                  <p className="mt-1 text-landing-muted">
                    &ldquo;Engineering scalability + reduced operational overhead&rdquo;
                  </p>
                </div>
                <div className="mt-2 flex items-center justify-between border-t border-landing-surface-border pt-4">
                  <p className="text-landing-muted">
                    Suggested CTA: <span className="text-landing-fg">15-minute discovery call</span>
                  </p>
                  <span className="rounded-full bg-landing-accent px-4 py-1.5 text-xs font-medium whitespace-nowrap text-landing-accent-foreground">
                    Generate Outreach
                  </span>
                </div>
              </div>
            </div>
          </div>
        </FadeIn>
      </div>
    </section>
  );
}
