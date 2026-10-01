# IT security controls

## In the code

| Control | Where | Test |
|---|---|---|
| Content Security Policy with per-request nonce + `strict-dynamic`; no `unsafe-inline` scripts, `frame-ancestors 'none'`, `object-src 'none'` | `packages/core/src/security/headers.ts`, set by the proxy (`db/middleware.ts`); root layout passes the nonce to the theme script | `security/security.test.ts` |
| HSTS (2y, preload), `X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy`, `COOP`, `Permissions-Policy`; `X-Powered-By` removed | `apps/web/next.config.ts` | build |
| Open-redirect fix on `/auth/callback?next=` (was `${origin}${next}`, exploitable with `@evil.com`) | `security/safe-redirect.ts` | `security.test.ts` |
| Constant-time comparison of webhook/cron secrets (was `!==`) | `security/timing-safe.ts` | `security.test.ts` |
| Password policy: >= 12 chars, <= 72 bytes (bcrypt limit), common-password and email-derived rejection | `security/password-policy.ts`, signup + reset | `security.test.ts` |
| TOTP MFA: enrollment UI, login step-up, and **enforcement in the proxy** for every dashboard route *and every server-action invocation* (actions can be POSTed to any path) | `security/mfa.ts`, `db/middleware.ts`, `/dashboard/settings/security`, `/login/mfa` | manual + build |
| DB-backed rate limiting for anonymous endpoints (interest signup, unsubscribe) and the data export; keys are hashed (no IPs stored) | `20260908090000_core_security.sql`, `security/rate-limit.ts` | `test-core-security.mjs` |
| Audit-log forgery fix: `write_audit_log()` let any authenticated user write into *any* tenant's log with any actor | `20260908100000_core_financial_controls.sql` | `test-core-financial-controls.mjs` |
| Licensing bypass fix: any member could activate any module for free from the Licenses page; now owner/admin only (`billing.manage`), and paid modules activate only from verified payment webhooks | `settings/licenses/actions.ts` | -- |
| Webhook verification: Stripe (`t=`/`v1=` HMAC, 5-min replay window), Razorpay (body HMAC + event-id dedupe), Resend (Svix); raw body verified before parsing; 512 KB body cap | `billing/*.ts`, `billing/webhook-handler.ts` | `billing/gateways.test.ts` |
| Secrets at rest: AI keys and payment-gateway keys AES-256-GCM encrypted; gateway ciphertext columns aren't even `SELECT`-able by the user role (column-level grants) | `crypto/api-key.ts`, `20260908110000_core_payment_gateways.sql` | `test-core-payment-gateways.mjs` |
| Tenant isolation + license gating in RLS on every table | all migrations | every `test-*-rls.mjs` |
| Dependency patching: critical Next.js RCE advisory (GHSA-vcvr-r3jv-pc5j) fixed by 16.3.4 -> 16.3.8; CI fails on high/critical production advisories; Dependabot weekly | `.github/workflows/ci.yml`, `.github/dependabot.yml` | CI |
| Vulnerability disclosure: `SECURITY.md`, RFC 9116 `/.well-known/security.txt` | | |

## Required configuration outside the repo

- **Supabase Auth**: enable *Leaked password protection*; set minimum password length to
  12; enable TOTP MFA; set JWT expiry <= 1h; restrict redirect URLs to your domains;
  enable CAPTCHA on signup/sign-in if you see abuse.
- **Supabase project**: enable PITR backups; keep the service-role key only in Vercel
  server env; turn on network restrictions for direct Postgres access; review the
  Security Advisor.
- **Vercel**: schedule `/api/cron/drain-events` (every few minutes) and
  `/api/cron/maintenance` (daily) with `CRON_SECRET`; enable deployment protection on
  preview deployments (they run with real env vars).
- **GitHub**: branch protection on `main` (required CI checks, required review, no force
  push) -- this is the change-management ITGC evidence; enable secret scanning and
  private vulnerability reporting.

## Known residual risks

- `style-src 'unsafe-inline'` is allowed (React style attributes can't carry nonces).
  Script execution is still nonce-gated.
- Login/signup brute force relies on Supabase Auth's built-in rate limits.
