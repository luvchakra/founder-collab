/**
 * DISC-OFFER-P0-03.1 "Offering Context Selector": where switching offering lands. The
 * section the founder is in (ICP, Prospects, Opportunities, ...) is kept -- "context
 * persists through relevant navigation" -- but anything deeper (one prospect, one run) is
 * dropped for that section's list, since a record from one offering has no counterpart
 * under another. Built from the current URL, so it can never point at a stale route shape.
 */
export const OFFERING_SECTIONS = [
  "icp",
  "discovery",
  "opportunities",
  "prospects",
  "watchlist",
  "performance",
  "conversions",
  "history",
  "usage",
] as const;

export function offeringSwitchHref(offeringsBasePath: string, pathname: string, currentOfferingId: string, targetOfferingId: string): string {
  const currentRoot = `${offeringsBasePath}/${currentOfferingId}`;
  const targetRoot = `${offeringsBasePath}/${targetOfferingId}`;
  if (pathname !== currentRoot && !pathname.startsWith(`${currentRoot}/`)) return targetRoot;
  const section = pathname.slice(currentRoot.length + 1).split("/")[0];
  return section && (OFFERING_SECTIONS as readonly string[]).includes(section) ? `${targetRoot}/${section}` : targetRoot;
}
