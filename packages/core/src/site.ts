/** Canonical site URL for SEO metadata (Open Graph, canonical links, sitemap). Set
 * NEXT_PUBLIC_SITE_URL once the platform has a production domain; falls back to
 * localhost so metadata is still well-formed in local dev without it.
 *
 * `||`, not `??`: apps/web/.env.example ships this key present-but-empty, so a
 * deployment that copies it verbatim sets the variable to "". Under `??` that empty
 * string is a value, and every canonical/Open Graph URL in the app would be built from
 * an empty origin. */
export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
