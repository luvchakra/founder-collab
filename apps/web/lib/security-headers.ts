/**
 * SEC-4: HTTP security headers for every response (applied in next.config.ts).
 *
 * The Content-Security-Policy here is a *baseline* policy, deliberately without a
 * per-request nonce. A nonce policy only works when every page is rendered on request,
 * and this app keeps public pages static on purpose (proxy.ts: "/" itself stays a static
 * page) while business pages live at arbitrary top-level slugs (/{businessSlug}/...),
 * so no path rule can safely tell "dynamic" from "static". What this policy still
 * enforces, with nothing that can break a page:
 *
 * - script-src limited to this origin plus Razorpay's Checkout widget -- an injected
 *   <script src="https://evil.example/x.js"> is refused (inline scripts stay allowed;
 *   that is the part a nonce policy would add);
 * - frame-ancestors 'none' (with X-Frame-Options for older browsers) -- no clickjacking;
 *   nothing in the app is designed to be framed;
 * - object-src 'none', base-uri 'self', form-action limited to us and the auth/payment
 *   providers a form can legitimately post or redirect to;
 * - connect-src/frame-src limited to Supabase and Razorpay, the only origins the browser
 *   talks to directly.
 *
 * Adding a browser-side integration (a new widget, analytics, a CDN) means adding its
 * origin here -- the CSP refuses it otherwise, visibly, in the browser console.
 */

const RAZORPAY_CHECKOUT = "https://checkout.razorpay.com";
const RAZORPAY_ORIGINS = "https://*.razorpay.com";
const SUPABASE_ORIGINS = "https://*.supabase.co wss://*.supabase.co";

/**
 * A Supabase URL that isn't a hosted *.supabase.co project -- the local stack e2e runs
 * against (scripts/start-local-supabase.sh, http://127.0.0.1:54321) -- needs its own origin
 * allowed, and, when it's plain http, no upgrade-insecure-requests (which would rewrite
 * every call to it to https). Hosted projects get exactly the policy they always had.
 */
function selfHostedSupabase(supabaseUrl: string | undefined): { origins: string; insecure: boolean } | null {
  if (!supabaseUrl) return null;
  let url: URL;
  try {
    url = new URL(supabaseUrl);
  } catch {
    return null;
  }
  if (url.hostname.endsWith(".supabase.co")) return null;
  const ws = url.protocol === "https:" ? "wss:" : "ws:";
  return { origins: `${url.origin} ${ws}//${url.host}`, insecure: url.protocol === "http:" };
}

export function buildContentSecurityPolicy({
  isDev,
  supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL,
}: {
  isDev: boolean;
  supabaseUrl?: string;
}): string {
  const selfHosted = selfHostedSupabase(supabaseUrl);
  const extra = selfHosted ? ` ${selfHosted.origins}` : "";
  const directives = [
    "default-src 'self'",
    // 'unsafe-eval' only in development: React uses eval for its dev-mode error overlays.
    `script-src 'self' 'unsafe-inline' ${RAZORPAY_CHECKOUT}${isDev ? " 'unsafe-eval'" : ""}`,
    // Inline style attributes/tags (Radix positioning, the chart component's <style>).
    "style-src 'self' 'unsafe-inline'",
    // Logos, avatars and attachments come from Supabase Storage or OAuth provider CDNs.
    `img-src 'self' data: blob: https:${extra}`,
    "media-src 'self' blob: https:",
    "font-src 'self' data:",
    `connect-src 'self' ${SUPABASE_ORIGINS}${extra} ${RAZORPAY_ORIGINS}`,
    // Razorpay Checkout opens its payment form in an iframe it hosts.
    `frame-src ${RAZORPAY_ORIGINS}`,
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    `form-action 'self' https://*.supabase.co${extra} ${RAZORPAY_ORIGINS} https://checkout.stripe.com https://accounts.google.com https://login.microsoftonline.com https://www.linkedin.com`,
    "frame-ancestors 'none'",
    // Not in development: it would rewrite http://localhost requests to https.
    ...(isDev || selfHosted?.insecure ? [] : ["upgrade-insecure-requests"]),
  ];
  return directives.join("; ");
}

export function securityHeaders({ isDev }: { isDev: boolean }): { key: string; value: string }[] {
  return [
    { key: "Content-Security-Policy", value: buildContentSecurityPolicy({ isDev }) },
    { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
    {
      key: "Permissions-Policy",
      // payment=(self) keeps the Payment Request API available to Razorpay Checkout.
      value: "camera=(), microphone=(), geolocation=(), usb=(), payment=(self \"https://checkout.razorpay.com\" \"https://api.razorpay.com\")",
    },
  ];
}
