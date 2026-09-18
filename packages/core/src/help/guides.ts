import { HELP_GUIDES } from "./generated/guides";
import type { HelpGuide, HelpSectionRef } from "./types";

export type { HelpGuide, HelpSection, HelpSectionRef } from "./types";
export { sectionHref } from "./types";

/** Every guide, in reading order (the `NN-` prefix on its source file). */
export function listGuides(): HelpGuide[] {
  return [...HELP_GUIDES].sort((a, b) => a.order - b.order);
}

export function getGuide(slug: string): HelpGuide | undefined {
  return HELP_GUIDES.find((guide) => guide.slug === slug);
}

/** Every section across every guide, flattened, each still knowing where it came from --
 * the unit both the search box and the help assistant work in. */
export function listSections(): HelpSectionRef[] {
  return listGuides().flatMap((guide) =>
    guide.sections.map((section) => ({
      guideSlug: guide.slug,
      guideTitle: guide.title,
      sectionId: section.id,
      heading: section.heading,
      body: section.body,
    })),
  );
}

export function getSection(guideSlug: string, sectionId: string): HelpSectionRef | undefined {
  return listSections().find(
    (section) => section.guideSlug === guideSlug && section.sectionId === sectionId,
  );
}
