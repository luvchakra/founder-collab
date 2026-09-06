/** Parses the active business/product id out of a /dashboard/businesses/[id]/... pathname
 * -- shared by Sidebar and the header's BusinessSelector so both agree on "current
 * business" from the same URL shape rather than duplicating the regex. */
export function getActiveIdsFromPath(pathname: string): {
  businessId: string | null;
  productId: string | null;
} {
  return {
    businessId: pathname.match(/\/dashboard\/businesses\/([^/]+)/)?.[1] ?? null,
    productId: pathname.match(/\/products\/([^/]+)/)?.[1] ?? null,
  };
}
