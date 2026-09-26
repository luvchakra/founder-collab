# Subscription billing — design, setup and readiness (BILL-40)

Implements `docs/plan/14-SUBSCRIPTION-BILLING-BACKLOG.md` (BILL-01..40). This is the
production readiness review the spec's §101/§104 asks for, and the runbook for turning
billing on.

## How it fits together

```text
Customer (owner/admin)                   Provider                      WonderArk
/[slug]/billing/plans ─► review ─► POST /api/billing/checkout
                                   (plan id + interval + idempotency key only)
                                   startCheckout(): resolve plan, currency, provider,
                                   price; checkout_sessions row; provider customer +
                                   checkout (idempotency key = session id)
                          ◄── Stripe Checkout redirect / Razorpay Checkout.js
                          pay ──► webhook ─► /api/webhooks/billing/{razorpay,stripe}
                                             verify raw-body signature ─► billing_events
                                             (unique provider+env+event id) ─► 200
                                             after(): processBillingEvent()
                                               refetch subscription/payment from API
                                               syncSubscription / syncPayment
                                               reconcileSubscriptionLicenses()
                                                 activateLicense / deactivateLicense
                                                 business_settings.plan
                                               audit (core.audit_log) + domain events
/[slug]/billing/success ◄── polls WonderArk's own checkout/subscription state
```

- **Tables** (`platform` schema, migrations `20260926130000..130200`): `billing_providers`
  (+`_events`), `billing_settings` (+`_events`), `plan_prices`, `billing_customers`,
  `subscriptions`, `billing_payments`, `billing_events`, `checkout_sessions`.
  `core.licenses` gains `source` (`manual`/`subscription`) and `subscription_id`.
- **Code**: `packages/core/src/billing/*` (providers, sync, provisioning, checkout,
  manage, webhooks, notifications), `packages/core/src/admin/platform-billing*.ts`,
  customer pages `apps/web/app/(dashboard)/[businessSlug]/billing/*`, admin pages
  `apps/web/app/platform/(protected)/billing/*` and plan prices on
  `/platform/plans/[id]/entitlements`.
- **Jobs**: `/api/cron/billing` (daily): retries failed/stranded webhook events, expires
  checkout sessions. Billing emails go through `core.domain_events` and the existing
  `/api/cron/drain-events`.

## Decisions worth knowing

1. **The plan decides the modules** (spec §5). The mockups show per-module ₹499 add-ons
   and a "Select modules" step; the spec says customers don't buy modules separately
   unless a plan models an add-on. Built per the spec. Add-ons would be a follow-up
   (a second price line per module) if wanted.
2. **No fabricated GST** (§56). The review page shows the plan price and says taxes are
   shown on the payment page. Configure tax at the provider (Stripe Tax / Razorpay
   plan amounts inclusive of GST) before charging Indian customers.
3. **Existing licences are never revoked by billing** (§13). Licences granted by hand stay
   `source='manual'`; a subscription adopts them when its plan includes the module and
   only ever sends its *own* licences into the 30-day grace.
4. **`past_due` keeps access**, `unpaid`/`paused`/`cancelled`/`expired` start the grace
   (ADR-9, §7, §11).
5. **Licences settings page**: only account owners/admins can change licences, and once
   online checkout is live a module is switched on by choosing a plan that includes it.
6. **Razorpay limits** (§54): no customer portal (Manage billing opens the subscription's
   hosted page), no undo of a cycle-end cancellation, its own proration.

## Setup runbook (in this order)

1. **`CRON_SECRET`** must be set in Vercel, or neither the billing retry sweep nor the
   email drain ever runs.
2. **Platform Admin → Billing → Providers**: for each provider you use, set environment
   (start with **test**), currencies (e.g. Razorpay `INR`, Stripe `USD,EUR,GBP`), countries
   (blank = any), priority, the public key (Razorpay Key ID / Stripe publishable key), then
   **Set secrets** (secret key + webhook secret). Enable it.
3. **Webhooks** — register the URL shown on the Providers page:
   - Razorpay: `…/api/webhooks/billing/razorpay`, events `subscription.*`,
     `payment.captured`, `payment.failed`, `refund.*`, `payment.dispute.created`.
   - Stripe: `…/api/webhooks/billing/stripe`, events `checkout.session.completed`,
     `customer.subscription.created|updated|deleted|paused|resumed`, `invoice.paid`,
     `invoice.payment_failed`, `invoice.payment_action_required`, `charge.refunded`,
     `charge.dispute.created`.
4. **Create the prices at the provider** (Razorpay Plans `plan_…`, Stripe Prices
   `price_…`), then record each on **Platform Admin → Plans → (plan) → Billing prices**
   for the same environment, currency and interval.
5. **Review plan entitlements**: the seeded Free plan currently includes **all five
   modules** — anyone choosing Free would get every module at no cost. Set Free's modules
   (Plans → Free → Entitlements) before enabling checkout.
6. **Billing settings**: upgrade/downgrade timing and proration (defaults: upgrades now,
   downgrades at renewal, proration on).
7. Test end to end in **test** mode (spec §90-§94: new customer, failed payment,
   cancellation, upgrade, downgrade), then switch each provider to **live** — switching
   clears the stored test secrets, so enter the live keys and re-point the webhooks.
8. Email: `RESEND_API_KEY`/`RESEND_FROM_EMAIL` (verified domain) for billing emails.

## Security review (§101)

| Check | Where |
|---|---|
| Webhook signature verified over the raw body | `providers/stripe.ts` `verifyStripeSignature` (t/v1 HMAC, 300 s window, constant time); `providers/razorpay.ts` `verifyRazorpaySignature`; routes read `request.text()` |
| Duplicate/replay protection | unique `billing_events (provider, environment, provider_event_id)`; Stripe timestamp window; processing is idempotent |
| Tenant isolation | RLS: subscriptions → business members; payments → account owners/admins; checkout sessions → requester; `scripts/test-platform-billing-rls.mjs` |
| Admin RBAC | every admin function calls `requireSuperadmin()`; provider/settings RPCs check `platform.is_superadmin()` |
| Customer RBAC | `billing/access.ts` — account owner/admin only for checkout, cancel, change, portal |
| No browser secret / no service role in browser | only the public key reaches the browser (`CheckoutResult`); service-role client used server-side only |
| No sensitive logging or audit data | `logBilling` takes a closed field list; audit payloads are ids/plan/status/amount; provider event snapshots hold fingerprints only |
| Environment separation | secrets cleared on test↔live switch; env-var fallback only when the key prefix matches; prices and events keyed by environment |
| Checkout tamper protection | strict body schema (amount/currency/price/modules → 400); plan and price resolved server-side; `route.test.ts` |
| Browser success spoofing | success page reads WonderArk state only; E2E `billing.spec.ts` |
| Licence reconciliation idempotency | `provisioning.ts` diff-based; `provisioning.test.ts` |
| Refund / cancellation authorization | superadmin (refund, immediate cancel); owner/admin (period-end cancel) |
| Provider API timeouts, safe retry | `providers/http.ts` 15 s timeout; failed events retried by cron up to 8 attempts |
| Rate limiting | checkout: 10 new sessions per business per 10 min (429); webhooks: signature check before any write — add a Vercel Firewall rule for extra headroom |
| No duplicate subscriptions | partial unique index on live subscriptions per business; checkout refuses a second paid plan |

## Known gaps / follow-ups

- Full provider sandbox E2E (§90-§94) needs test keys configured; the automated suite
  covers everything up to the provider hand-off.
- Admin: no event-detail view, revenue chart or subscriber counts on the Plans list yet.
- Email copy lives in `billing/event-handlers.ts`; `platform.email_templates` only knows
  its seven system templates today.
