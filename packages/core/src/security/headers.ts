/**
 * HTTP security headers. Two halves:
 *
 * - `STATIC_SECURITY_HEADERS` -- identical on every response, so apps/web/next.config.ts
 *   applies them to every path (including static assets the proxy never sees).
 * - `buildContentSecurityPolicy()` -- needs a fresh per-request nonce, so the proxy
 *   (packages/core/src/db/middleware.ts) builds it on every request. Next.js reads the
 *   nonce back out of the request's CSP header during rendering and attaches it to its
 *   own framework scripts (node_modules/next/dist/docs/01-app/02-guides/
 *   content-security-policy.md) -- which only works on dynamically rendered pages, which
 *   is why the root layout reads headers() for the nonce.
 *
 * Payment checkout (Stripe Checkout, Razorpay subscription/payment-link pages) is a
 * full-page redirect to the provider's hosted page, not an embedded script or iframe --
 * no provider origin needs script-src/frame-src. Their origins appear only in
 * form-action, because Chrome applies form-action to the redirect that follows a
 * no-JS form submission.
 */
export const STATIC_SECURITY_HEADERS: { key: string; value: string }[] = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()",
  },
];

const FORM_ACTION_ORIGINS = [
  "https://checkout.stripe.com",
  "https://billing.stripe.com",
  "https://*.razorpay.com",
  "https://rzp.io",
  "https://accounts.google.com",
];

export function generateNonce(): string {
  return Buffer.from(crypto.randomUUID()).toString("base64");
}

export function buildContentSecurityPolicy(input: {
  nonce: string;
  isDev: boolean;
  supabaseUrl?: string;
}): string {
  const supabase = input.supabaseUrl ? new URL(input.supabaseUrl).origin : "";
  const supabaseWs = supabase ? supabase.replace(/^http/, "ws") : "";
  const directives = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${input.nonce}' 'strict-dynamic'${input.isDev ? " 'unsafe-eval'" : ""}`,
    // Inline style *attributes* (Radix positioning, recharts, sonner) can't carry a
    // nonce; 'unsafe-inline' for styles is the standard trade-off -- it does not weaken
    // script-src, which is where XSS actually executes.
    "style-src 'self' 'unsafe-inline'",
    // Avatars come from Supabase Storage or an OAuth provider's CDN (Google's
    // `picture`), so any https image origin is allowed; never http.
    "img-src 'self' blob: data: https:",
    "font-src 'self' data:",
    `connect-src 'self' ${supabase} ${supabaseWs}`.trim(),
    "object-src 'none'",
    "base-uri 'self'",
    `form-action 'self' ${supabase} ${FORM_ACTION_ORIGINS.join(" ")}`.replace(/\s+/g, " ").trim(),
    "frame-ancestors 'none'",
    ...(input.isDev ? [] : ["upgrade-insecure-requests"]),
  ];
  return directives.join("; ");
}
