/**
 * The one place the platform's display name is defined. Everywhere a page, prompt,
 * email, or API doc needs to say the product's name, it imports BRAND_NAME from here
 * instead of hardcoding a string -- so renaming the product is a one-line change (or an
 * env var override, no code change/redeploy at all) rather than a grep-and-replace
 * across every marketing page, AI system prompt, and email template.
 *
 * NEXT_PUBLIC_BRAND_NAME is a build-time-inlined env var (Next.js's NEXT_PUBLIC_
 * convention), so this same constant works identically in Server Components, Client
 * Components, and server-only code (AI prompts, email bodies, OpenAPI docs) -- no need
 * for a separate server-only variant.
 */
export const BRAND_NAME = process.env.NEXT_PUBLIC_BRAND_NAME || "WonderArc";
