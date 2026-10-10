import { notFound, redirect } from "next/navigation";
import { resolveBusinessSlugById } from "@cofounderai/core/businesses/resolve";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Business pages used to live at /dashboard/businesses/<id>/..., before routes moved to the
 * business's slug (/<slug>/...). Links still built the old way -- Discovery's offering
 * pages and bell alerts, CRM's timeline and exception links, anything bookmarked -- had no
 * route and showed a 404 (found during DISC-OFFER-P1-05.4). This sends each one to the same
 * page under the slug, keeping the query string. The slug lookup runs under the signed-in
 * user's own RLS, so a business they aren't a member of is a plain 404 -- the redirect
 * never reveals another business's slug.
 */
export default async function LegacyBusinessPathRedirect({
  params,
  searchParams,
}: {
  params: Promise<{ businessId: string; rest?: string[] }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ businessId, rest = [] }, query] = await Promise.all([params, searchParams]);
  if (!UUID.test(businessId)) notFound();
  const slug = await resolveBusinessSlugById(businessId);
  if (!slug) notFound();

  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    for (const v of Array.isArray(value) ? value : value === undefined ? [] : [value]) search.append(key, v);
  }
  const path = [slug, ...rest].map(encodeURIComponent).join("/");
  redirect(`/${path}${search.size > 0 ? `?${search}` : ""}`);
}
