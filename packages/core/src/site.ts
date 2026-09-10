/**
 * Canonical site URL -- used both for SEO metadata (Open Graph, canonical links,
 * sitemap) and for building the public links this platform emails out (estimate/
 * invoice/customer-center portal tokens: module-fsm's estimates|invoices|customer-
 * center/mutations.ts). Set NEXT_PUBLIC_SITE_URL once the platform has a custom
 * production domain to pin this explicitly.
 *
 * Until then, falls back to Vercel's own automatically-injected env vars for the
 * deployment's real URL (VERCEL_PROJECT_PRODUCTION_URL -- the stable production
 * domain; VERCEL_URL -- this specific deployment's own preview/production URL, a
 * narrower fallback for a preview deployment with no production domain of its own)
 * rather than defaulting straight to localhost -- a founder who deploys without ever
 * setting NEXT_PUBLIC_SITE_URL should still get working emailed links on whatever
 * *.vercel.app domain the deployment is actually reachable at, not a link to their
 * own machine. localhost is the last resort, for local dev only.
 */
export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ??
  (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : undefined) ??
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined) ??
  "http://localhost:3000";
