import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { getGuide, listGuides } from "@cofounderai/core/help/guides";
import { Markdown } from "@/components/help/markdown";
import { HelpAssistant } from "@/components/help/help-assistant";

export function generateStaticParams() {
  return listGuides().map((guide) => ({ slug: guide.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const guide = getGuide(slug);
  return { title: guide ? `${guide.title} · Help` : "Help" };
}

/**
 * One guide.
 *
 * Two columns on a desktop: the content, and a rail carrying the ask box and the contents
 * of this page. The rail sticks, because the whole point of a contents list is to be
 * reachable from halfway down a long document. Below the tablet breakpoint the rail
 * becomes a collapsed <details> above the content -- a sticky sidebar on a phone is just
 * a thing covering the text.
 *
 * Every section is its own anchor, which is what the FAQ and the assistant link into.
 */
export default async function HelpGuidePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const guide = getGuide(slug);
  if (!guide) notFound();

  const guides = listGuides();
  const index = guides.findIndex((entry) => entry.slug === guide.slug);
  const previous = index > 0 ? guides[index - 1] : null;
  const next = index >= 0 && index < guides.length - 1 ? guides[index + 1] : null;

  const contents = (
    <nav aria-label="On this page" className="flex flex-col gap-1">
      {guide.sections.map((section) => (
        <a
          key={section.id}
          href={`#${section.id}`}
          className="rounded-md px-2 py-1 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          {section.heading}
        </a>
      ))}
    </nav>
  );

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 p-4 sm:p-8">
      <div className="flex flex-col gap-3">
        <Link
          href="/help"
          className="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" aria-hidden="true" />
          Get Help
        </Link>
        <div>
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{guide.title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{guide.summary}</p>
        </div>
      </div>

      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        <div className="min-w-0 flex-1 order-2 lg:order-1">
          <div className="flex flex-col divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
            {guide.sections.map((section) => (
              <section key={section.id} id={section.id} className="scroll-mt-20 p-4 sm:p-6">
                <h2 className="text-base font-semibold text-foreground sm:text-lg">
                  {section.heading}
                </h2>
                <div className="mt-3">
                  <Markdown content={section.body} />
                </div>
              </section>
            ))}
          </div>

          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-between">
            {previous ? (
              <Link
                href={`/help/${previous.slug}`}
                className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm transition-colors hover:border-primary"
              >
                <ArrowLeft className="size-3.5 shrink-0" aria-hidden="true" />
                <span className="truncate">{previous.title}</span>
              </Link>
            ) : (
              <span />
            )}
            {next ? (
              <Link
                href={`/help/${next.slug}`}
                className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm transition-colors hover:border-primary sm:ml-auto"
              >
                <span className="truncate">{next.title}</span>
                <ArrowRight className="size-3.5 shrink-0" aria-hidden="true" />
              </Link>
            ) : null}
          </div>
        </div>

        <aside className="order-1 flex shrink-0 flex-col gap-4 lg:order-2 lg:sticky lg:top-6 lg:w-72">
          <HelpAssistant compact />

          {/* Desktop: always-open contents. Phone: collapsed, so it never pushes the
              guide itself off the first screen. */}
          <div className="hidden rounded-xl border border-border bg-card p-3 lg:block">
            <p className="px-2 pb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              On this page
            </p>
            {contents}
          </div>
          <details className="rounded-xl border border-border bg-card p-3 lg:hidden">
            <summary className="cursor-pointer px-2 text-sm font-medium">On this page</summary>
            <div className="mt-2">{contents}</div>
          </details>
        </aside>
      </div>
    </main>
  );
}
