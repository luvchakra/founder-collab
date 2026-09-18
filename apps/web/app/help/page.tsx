import Link from "next/link";
import { ArrowRight, BookOpen } from "lucide-react";
import { listGuides } from "@cofounderai/core/help/guides";
import { FAQ, FAQ_CATEGORIES } from "@cofounderai/core/help/faq";
import { sectionHref } from "@cofounderai/core/help/types";
import { HelpAssistant } from "@/components/help/help-assistant";

export const metadata = { title: "Get Help" };

/**
 * The help hub.
 *
 * Ordered by how people actually arrive: most come with one specific question, so the
 * ask box is first and is the only thing above the fold. The FAQ answers the questions
 * the guides' structure makes hard to find, and the guides themselves — the thing you
 * read rather than search — come last.
 *
 * The FAQ uses native <details>, so it opens and closes with no JavaScript, works before
 * hydration, and is searchable by the browser's own find-in-page. A question you cannot
 * Ctrl-F is a question nobody finds.
 */
export default function HelpPage() {
  const guides = listGuides();

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-8 p-4 sm:p-8">
      <div>
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Get Help</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Ask a question, or read the guide for the part of the platform you&apos;re in.
        </p>
      </div>

      <HelpAssistant
        suggestions={[
          "How do I reconcile a bank statement?",
          "How do I license a module?",
          "Why isn't my invoice in the ledger?",
          "How do I add someone to my team?",
        ]}
      />

      <section aria-labelledby="faq-heading" className="flex flex-col gap-4">
        <div>
          <h2 id="faq-heading" className="text-base font-semibold">
            Frequently asked
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            The things people ask most, each with a link to the full explanation.
          </p>
        </div>

        {FAQ_CATEGORIES.map((category) => {
          const entries = FAQ.filter((entry) => entry.category === category);
          if (entries.length === 0) return null;
          return (
            <div key={category} className="flex flex-col gap-2">
              <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {category}
              </h3>
              <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
                {entries.map((entry) => (
                  <details key={entry.question} className="group">
                    <summary className="flex cursor-pointer items-start justify-between gap-3 px-4 py-3 text-sm font-medium transition-colors hover:bg-accent/50">
                      <span>{entry.question}</span>
                      <span
                        aria-hidden="true"
                        className="mt-0.5 shrink-0 text-muted-foreground transition-transform group-open:rotate-90"
                      >
                        ›
                      </span>
                    </summary>
                    <div className="border-t border-border bg-muted/20 px-4 py-3">
                      <p className="text-sm leading-relaxed text-muted-foreground">{entry.answer}</p>
                      <Link
                        href={sectionHref(entry.guideSlug, entry.sectionId)}
                        className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
                      >
                        Read the full section
                        <ArrowRight className="size-3.5" aria-hidden="true" />
                      </Link>
                    </div>
                  </details>
                ))}
              </div>
            </div>
          );
        })}
      </section>

      <section aria-labelledby="guides-heading" className="flex flex-col gap-4">
        <div>
          <h2 id="guides-heading" className="text-base font-semibold">
            User guides
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Start with Getting Started if you&apos;re new; the rest are one per module.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          {guides.map((guide) => (
            <Link
              key={guide.slug}
              href={`/help/${guide.slug}`}
              className="group flex flex-col gap-2 rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary"
            >
              <div className="flex items-center gap-2">
                <BookOpen className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                <span className="font-medium group-hover:text-primary">{guide.title}</span>
              </div>
              <p className="line-clamp-3 text-sm text-muted-foreground">{guide.summary}</p>
              <span className="mt-auto text-xs text-muted-foreground">
                {guide.sections.length} {guide.sections.length === 1 ? "section" : "sections"}
              </span>
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}
