/** Parses the active business slug/product id out of a /[businessSlug]/... pathname --
 * shared by Sidebar and the header's BusinessSelector so both agree on "current business"
 * from the same URL shape rather than duplicating the regex. Returns the *slug*, not the
 * business id: this file (module-discovery) has no server-side way to resolve one to the
 * other client-side, and doesn't need to -- every caller already has the full business
 * list (with `id`+`slug`) in hand and can look the id up itself, same as
 * DashboardChrome's own businessHref already does.
 *
 * A path under the account-level /dashboard or /platform control plane never has a
 * business slug as its first segment (those are reserved, core.business_settings.slug's
 * own CHECK constraint enforces the same list) -- so those return null here rather than
 * misreading "dashboard"/"platform" itself as a slug. */
export function getActiveIdsFromPath(pathname: string): {
  businessSlug: string | null;
  productId: string | null;
} {
  const isAccountLevel = pathname.startsWith("/dashboard") || pathname.startsWith("/platform");
  return {
    businessSlug: isAccountLevel ? null : (pathname.match(/^\/([^/]+)/)?.[1] ?? null),
    productId: pathname.match(/\/products\/([^/]+)/)?.[1] ?? null,
  };
}
