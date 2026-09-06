/** Canonical site URL for SEO metadata (Open Graph, canonical links, sitemap). Set
 * NEXT_PUBLIC_SITE_URL once the platform has a production domain; falls back to
 * localhost so metadata is still well-formed in local dev without it. */
export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
