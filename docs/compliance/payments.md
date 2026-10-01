# Payments: Razorpay + Stripe

No SDKs: both providers are called over their REST APIs with `fetch`
(`packages/core/src/billing/{stripe,razorpay}.ts`), matching how the repo already verifies
Resend webhooks. Card, UPI and bank details are only ever entered on the provider's
hosted page, so this platform stays in PCI DSS SAQ-A scope.

## Flow A: platform billing (a business pays for module licenses)

1. **Billing** page -> *Subscribe* (needs `billing.manage`). Stripe: a Checkout Session in
   subscription mode. Razorpay: a Subscription whose `short_url` hosts the mandate
   (UPI Autopay, card, eMandate). Both carry `business_id` and `module_key` metadata.
2. The provider sends a signed webhook to `/api/webhooks/stripe` or `/api/webhooks/razorpay`.
3. `billing/webhook-handler.ts` verifies the signature over the raw body, records the event
   once in `core.payment_gateway_events` (idempotent; retries are safe), then
   `applySubscriptionEvent()` upserts `core.subscriptions` and drives the license:
   - `active` / `past_due` -> `activateLicense()` (past_due keeps access during dunning)
   - `halted` / `cancelled` / `paused` -> `deactivateLicense()`, i.e. ADR-9's 30-day
     read-only grace, never deletion (skipped while another live subscription covers the module)
   - events older than the last one applied are ignored (providers don't guarantee order)
4. *Cancel* cancels at period end; the license enters grace when the provider confirms.

A module with an active `core.billing_prices` row can no longer be activated for free
from the Licenses page.

### Registering prices

Create the product and price (Stripe) or plan (Razorpay) in the provider dashboard, then
register it (with service role / SQL editor; test-mode and live-mode ids differ):

```sql
insert into core.billing_prices (module_key, provider, currency, amount_minor, billing_interval, provider_price_id)
values ('fsm', 'razorpay', 'INR', 199900, 'month', 'plan_XXXX'),
       ('fsm', 'stripe',   'USD',   4900, 'month', 'price_XXXX');
```

To retire a price: `update core.billing_prices set is_active = false where id = ...`
(existing subscriptions keep running).

## Flow B: collections (a business collects from its own customers)

1. **Billing -> Collect payments**: the business saves its own Stripe or Razorpay keys
   (AES-256-GCM encrypted; the ciphertext isn't readable even by its own session) and
   points the gateway's webhook at `/api/webhooks/payments/<provider>/<businessId>`.
2. `createPaymentRequestForDocument(documentId, provider)` (needs `payments.record`)
   creates a Stripe Checkout (payment mode) or a Razorpay Payment Link for the
   document's open balance and returns its URL to send to the customer. This is the
   FSM PRD's "online payment link"; invoice screens (SP-7 / F-8) call it.
3. The paid webhook is verified with *that business's* secret.
   `core.record_gateway_payment()` then records a `core.payments` row (`method` =
   provider), allocates it to the document, and marks the request paid -- atomically,
   idempotently, and rejecting any amount/currency that doesn't match the request.
   The payment then falls under every financial control (see the SOX doc).

## Runbook

- **Failed events**: `select * from core.payment_gateway_events where status = 'failed'`.
  The provider retries automatically (Stripe for up to 3 days, Razorpay for 24h); each
  retry reprocesses. To retry manually after fixing the cause, resend the event from the
  provider dashboard.
- **Ignored events** (e.g. a subscription created in the dashboard without our
  metadata) are recorded with `status = 'ignored'`.
- **Testing locally**: `stripe listen --forward-to localhost:3000/api/webhooks/stripe`;
  Razorpay test mode plus a tunnel (e.g. ngrok) for webhooks.
