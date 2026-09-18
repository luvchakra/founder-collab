/**
 * The shape of the in-app help content. The content itself is generated from
 * `docs/user-guides/*.md` by `scripts/build-help-content.mjs` -- the markdown is what a
 * person edits; this is only how the app reads it.
 */

export type HelpSection = {
  /** Slug of the heading, with any leading "N." dropped. This is the URL fragment the
   * guide page renders and the help assistant links to, so it has to survive a section
   * being renumbered. */
  id: string;
  heading: string;
  /** Raw markdown, rendered by `components/help/markdown.tsx`. */
  body: string;
};

export type HelpGuide = {
  /** `05-finance.md` -> `finance`; the URL segment under /dashboard/help. */
  slug: string;
  /** The `NN-` file prefix, which is the reading order. */
  order: number;
  title: string;
  /** First sentence of the guide's opening paragraph, in plain text. */
  summary: string;
  sections: HelpSection[];
};

/** One section, carrying enough of its guide to be linked and labelled on its own. */
export type HelpSectionRef = {
  guideSlug: string;
  guideTitle: string;
  sectionId: string;
  heading: string;
  body: string;
};

export function sectionHref(guideSlug: string, sectionId: string): string {
  return `/dashboard/help/${guideSlug}#${sectionId}`;
}
