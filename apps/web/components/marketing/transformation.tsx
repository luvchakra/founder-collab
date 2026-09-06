import { FadeIn } from "./fade-in";

const BEFORE = [
  "Product built",
  "No clear ICP",
  "Random prospect list",
  "Generic emails",
  "Few responses",
  "Unclear next steps",
];

const AFTER = [
  "Product understood",
  "ICP identified",
  "Best prospects discovered",
  "Prospects researched",
  "Personalized strategy",
  "Founder-approved outreach",
  "Conversation analyzed",
  "Next action recommended",
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
                  : "bg-white/10 text-landing-muted"
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
            <Path title="Founder, alone" steps={BEFORE} accent={false} />
          </FadeIn>
          <FadeIn delayMs={100}>
            <Path title="Founder + CoFounderAI" steps={AFTER} accent />
          </FadeIn>
        </div>

        <FadeIn delayMs={200}>
          <p className="mt-12 text-balance text-center text-2xl font-medium text-landing-fg sm:text-3xl">
            From &ldquo;Who do I sell to?&rdquo; to &ldquo;Here are the 10 people you
            should talk to next.&rdquo;
          </p>
        </FadeIn>
      </div>
    </section>
  );
}
