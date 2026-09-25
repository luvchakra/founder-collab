import { Markdown } from "@/components/help/markdown";
import type { LegalSection } from "@/lib/legal-content";

/**
 * One legal document (/terms, /privacy): title, effective date, a short introduction, a
 * contents list, then each section under its own anchor. The body is rendered by the user
 * guides' Markdown renderer, so these pages look like the rest of the public
 * documentation and nothing here produces raw HTML.
 *
 * The contents list is a plain list of in-page links rather than a sticky rail: legal
 * pages get read top to bottom or searched with find-in-page, and on a phone a sticky
 * rail is just something covering the text.
 */
export function LegalDocument({
  title,
  lastUpdated,
  intro,
  sections,
}: {
  title: string;
  lastUpdated: string;
  intro: string;
  sections: LegalSection[];
}) {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-4 py-10 sm:px-8 sm:py-14">
      <header className="flex flex-col gap-3">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">{title}</h1>
        <p className="text-sm text-muted-foreground">Last updated: {lastUpdated}</p>
        <Markdown content={intro} />
      </header>

      <nav aria-label="Contents" className="rounded-xl border border-border p-4 sm:p-5">
        <p className="text-sm font-medium text-foreground">Contents</p>
        <ol className="mt-3 grid list-decimal gap-x-8 gap-y-1.5 pl-5 text-sm sm:grid-cols-2">
          {sections.map((section) => (
            <li key={section.id} className="text-muted-foreground">
              <a href={`#${section.id}`} className="hover:text-foreground hover:underline">
                {section.title}
              </a>
            </li>
          ))}
        </ol>
      </nav>

      {sections.map((section, index) => (
        <section key={section.id} id={section.id} aria-labelledby={`${section.id}-heading`} className="scroll-mt-24">
          <h2 id={`${section.id}-heading`} className="text-lg font-semibold text-foreground">
            {index + 1}. {section.title}
          </h2>
          <div className="mt-3">
            <Markdown content={section.body} />
          </div>
        </section>
      ))}
    </main>
  );
}
