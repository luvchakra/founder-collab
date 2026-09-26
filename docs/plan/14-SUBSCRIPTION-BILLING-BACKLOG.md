# WonderArk — Razorpay + Stripe Subscription & Licensing Integration
## Implementation-ready specification for Claude Code

**Repository:** `https://github.com/luvchakra/founder-collab`  
**Branch:** `main`  
**Purpose:** Allow WonderArk customers to purchase platform subscription plans, automatically provision the corresponding module licenses/entitlements, manage renewals/upgrades/downgrades/cancellations, and give Platform Admin complete control over pricing, payment providers, subscriptions, payments and billing operations.

---

# 1. Executive summary

WonderArk already has a platform-level subscription catalog under:

```text
/platform/plans
/platform/plans/[id]/entitlements
```

The existing plan model defines:

- plan key
- name
- description
- price
- billing interval
- currency
- lifecycle status
- display order
- marketing visibility
- module entitlements
- feature entitlements
- quantity limits

This specification adds a production-grade billing layer around that existing catalog.

The resulting architecture is:

```text
WonderArk Plan
      |
      +---- Pricing
      |
      +---- Provider Price Mapping
      |       |
      |       +---- Razorpay
      |       +---- Stripe
      |
      +---- Checkout
      |
      +---- Payment
      |
      +---- Subscription
      |
      +---- Billing Events / Webhooks
      |
      +---- Entitlement Provisioning
      |
      +---- core.licenses
      |
      +---- Module Access
```

The payment provider is **not** the source of truth for WonderArk authorization.

WonderArk remains the source of truth for:

- subscription state used by the application;
- plan;
- entitlement;
- module license;
- access;
- grace period;
- cancellation behavior;
- internal audit;
- business ownership.

Razorpay and Stripe are payment processors and billing-system integrations.

---

# 2. Current architecture constraints

Claude Code MUST first inspect the latest `main` before implementation.

Do not assume table names that have not been verified.

Existing architectural rules remain mandatory:

- Next.js 16 App Router.
- One Vercel deployment.
- One Supabase project.
- `core` owns cross-module tenancy, identity, licensing, RBAC, payments, documents, audit and background jobs.
- Platform control-plane data lives in `platform`.
- Customer module data lives in `discovery`, `inventory`, `fsm`, `crm`, `gst`.
- RLS is mandatory.
- Server-side authorization is mandatory.
- No service-role credentials in browser code.
- No module may import another module's internals.
- Existing `core.licenses` remains the authorization mechanism.
- License cancellation does not delete module data.
- Existing 30-day read-only grace behavior must remain intact.
- AI is not allowed to authorize or execute payments.
- Webhooks are untrusted until signature verification succeeds.
- Webhook processing must be idempotent.
- Do not refactor unrelated functionality.
- Use existing UI and design rules.
- Existing Discovery implementation remains protected.

---

# 3. Provider research findings

## 3.1 Razorpay

Razorpay provides subscription APIs for recurring billing, fixed schedules, subscription lifecycle events and webhook notifications. Razorpay documents subscription events such as activation, pending/failing payment and halted subscriptions. It supports recurring payment methods including cards and UPI Autopay/eMandate subject to current eligibility and regulatory/payment-method constraints.

Official references:

- Razorpay Subscriptions: https://razorpay.com/subscriptions/
- Razorpay Payment Gateway: https://razorpay.com/payment-gateway/
- Razorpay UPI Autopay: https://razorpay.com/upi-autopay/
- Razorpay security checklist: https://razorpay.com/security/checklist

Important implementation consequence:

**Never activate a WonderArk paid license merely because the browser returned from Razorpay Checkout.**

Use the trusted server-side payment/provider state and verified webhook/API state.

Razorpay explicitly recommends server-side payment verification and HMAC validation for webhooks.

---

## 3.2 Stripe

Stripe Billing supports recurring subscriptions, price objects, customer objects, Checkout, subscription lifecycle events, customer portal functionality and subscription changes.

Stripe documents:

- subscription creation;
- subscription updates;
- proration behavior;
- cancellation;
- payment failures;
- customer portal;
- webhook-driven lifecycle synchronization.

Official references:

- Stripe subscriptions: https://docs.stripe.com/billing/subscriptions
- Stripe subscription creation: https://docs.stripe.com/api/subscriptions/create
- Stripe subscription update/proration: https://docs.stripe.com/api/subscriptions/update
- Stripe cancellation: https://docs.stripe.com/api/subscriptions/cancel
- Stripe customer portal: https://docs.stripe.com/api/customer_portal/sessions/create

Important implementation consequence:

WonderArk should not attempt to reproduce all payment-method management itself.

Use Stripe Checkout for payment collection and Stripe Customer Portal for payment-method/invoice/subscription-management capabilities where appropriate, while keeping WonderArk's internal subscription and license state synchronized through verified webhooks.

---

# 4. Business requirements

## BR-01 — Customers can buy a plan

A user with an eligible WonderArk business must be able to:

1. open Pricing / Plans;
2. select a plan;
3. review included modules and limits;
4. choose billing interval where supported;
5. review amount and currency;
6. proceed to payment;
7. complete payment;
8. return to WonderArk;
9. see subscription provisioning status;
10. receive module licenses automatically after trusted payment confirmation.

---

# 5. BR-02 — One plan controls multiple module licenses

A WonderArk plan may contain:

```text
Pro
├── Discovery       enabled
├── Inventory       enabled
├── Service         enabled
├── CRM             enabled
└── Finance         enabled
```

The customer does not separately buy each module unless the plan explicitly models an add-on in future.

The plan's module entitlements determine which licenses are provisioned.

---

# 6. BR-03 — License provisioning

After successful payment/subscription activation:

```text
Payment confirmed
        ↓
WonderArk subscription active
        ↓
Resolve plan
        ↓
Resolve module entitlements
        ↓
Create/update core.licenses
        ↓
Publish license events
        ↓
Modules become available
```

Provisioning must be idempotent.

If the webhook is delivered five times, it must not create five licenses.

---

# 7. BR-04 — Payment state and license state are separate

Example:

```text
Provider:
subscription = past_due

WonderArk:
license = active
grace/recovery state = payment_recovery
```

The provider state should not be blindly copied into the license state.

WonderArk's licensing rules remain authoritative.

---

# 8. BR-05 — Cancellation

Default customer cancellation behavior:

```text
Cancel requested
        ↓
Auto-renew disabled
        ↓
Current paid period remains active
        ↓
Period ends
        ↓
WonderArk enters existing license grace behavior
```

Do not immediately revoke access merely because the customer clicks Cancel.

Where the provider supports cancel-at-period-end, prefer that behavior for normal cancellation.

Immediate cancellation should be an explicit administrative action.

---

# 9. BR-06 — Upgrade

Upgrade flow:

```text
Current plan
     ↓
Select higher plan
     ↓
Calculate price difference
     ↓
Provider subscription change
     ↓
Payment/proration confirmation
     ↓
Verified provider event
     ↓
Update WonderArk subscription
     ↓
Provision additional licenses/entitlements
```

Do not provision the upgraded entitlement based only on the user's button click.

---

# 10. BR-07 — Downgrade

Downgrades should normally be scheduled for the next billing period unless Platform Admin explicitly enables immediate changes.

This avoids accidental immediate loss of paid access.

If a downgrade removes a module:

```text
Downgrade scheduled
        ↓
Current period remains active
        ↓
Next period begins
        ↓
Removed license follows existing cancellation/grace policy
```

---

# 11. BR-08 — Failed payment

Payment failure must not create a false "paid" state.

The customer should see:

```text
Payment needs attention
Your subscription is still active while we try to recover payment.
Update payment method
```

Provider-specific retry behavior remains with the provider.

WonderArk should listen for verified provider events and update the internal subscription/payment state.

---

# 12. BR-09 — Free plan

The free plan does not require a payment provider.

Flow:

```text
Free plan selected
      ↓
WonderArk subscription created internally
      ↓
Provision free-plan licenses
```

No Razorpay/Stripe customer or subscription is required for a free plan unless future analytics requirements justify it.

---

# 13. BR-10 — Existing customers

Existing businesses may already have licenses created manually or by previous provisioning.

Migration must not revoke access.

For existing businesses:

1. inspect existing license state;
2. create a subscription record only when required;
3. preserve current licenses;
4. associate licenses with the subscription/plan where possible;
5. do not make existing customers pay again automatically.

---

# 14. Provider strategy

Create a provider abstraction.

```text
BillingProvider
├── RazorpayProvider
└── StripeProvider
```

Core interface should support:

```text
createCustomer()
getCustomer()
createCheckout()
createSubscription()
getSubscription()
changeSubscription()
cancelSubscription()
resumeSubscription()
createPortalSession()
getPayment()
refundPayment()
verifyWebhook()
```

Do not expose Razorpay/Stripe types throughout application code.

Only the provider adapters should know provider-specific SDK/API structures.

---

# 15. Provider routing

Platform Admin must be able to configure which provider handles a plan/currency/market.

Initial recommended model:

```text
Billing Configuration
├── Razorpay
│   ├── enabled
│   ├── supported currencies
│   └── supported countries
└── Stripe
    ├── enabled
    ├── supported currencies
    └── supported countries
```

Plan pricing may then contain provider-specific references.

Example:

```text
Pro / INR / Monthly
    Razorpay Plan ID = plan_...
    Stripe Price ID = price_...
```

The provider ID is never accepted from an untrusted browser request without server-side validation.

---

# 16. Do not create provider prices automatically on every checkout

Prices should be managed explicitly.

The platform admin should create/synchronize provider-side prices and store their IDs.

This prevents:

- duplicate prices;
- inconsistent billing;
- orphaned provider objects;
- accidental pricing changes.

---

# 17. Pricing architecture

Existing platform plan:

```text
platform.plans
```

should remain the canonical WonderArk commercial plan.

Add provider mapping rather than replacing the existing plan model.

Conceptual table:

```text
platform.plan_prices
```

Fields:

```text
id
plan_id
provider
provider_price_id
provider_product_id
currency
billing_interval
amount
active
created_at
updated_at
```

Unique constraint:

```text
provider + provider_price_id
```

Recommended uniqueness:

```text
plan_id + provider + currency + billing_interval
```

---

# 18. Billing customer model

Create a platform-level mapping.

Conceptual:

```text
platform.billing_customers
```

Fields:

```text
id
business_id
provider
provider_customer_id
email
currency
created_at
updated_at
```

Unique:

```text
provider + provider_customer_id
```

and:

```text
business_id + provider
```

Do not store card numbers, CVVs, bank credentials or raw payment credentials.

---

# 19. Subscription model

Conceptual:

```text
platform.subscriptions
```

Fields:

```text
id
business_id
plan_id
provider
provider_customer_id
provider_subscription_id
status
billing_interval
currency
amount
current_period_start
current_period_end
cancel_at_period_end
cancelled_at
trial_start
trial_end
provider_created_at
provider_updated_at
metadata
created_at
updated_at
```

Recommended status values:

```text
incomplete
trialing
active
past_due
paused
cancel_scheduled
cancelled
unpaid
expired
```

Provider-specific raw status must be stored separately if needed.

---

# 20. Payment model

Conceptual:

```text
platform.payments
```

Fields:

```text
id
business_id
subscription_id
provider
provider_payment_id
provider_invoice_id
provider_order_id
amount
currency
status
payment_method_type
paid_at
failed_at
failure_code
failure_message_safe
refunded_amount
created_at
updated_at
```

Never store sensitive payment credentials.

---

# 21. Billing event model

Create an idempotent webhook/event table.

Conceptual:

```text
platform.billing_events
```

Fields:

```text
id
provider
provider_event_id
event_type
received_at
processed_at
processing_status
attempt_count
payload_hash
error_code
error_message_safe
created_at
```

Unique:

```text
provider + provider_event_id
```

This is mandatory.

---

# 22. Billing event processing

Webhook:

```text
Provider
   ↓
HTTPS endpoint
   ↓
Verify signature
   ↓
Find provider event ID
   ↓
Idempotency check
   ↓
Persist event
   ↓
Process transactionally
   ↓
Update subscription/payment
   ↓
Provision/reconcile licenses
   ↓
Audit
   ↓
Return 2xx
```

Do not perform license changes before signature validation.

---

# 23. Razorpay webhook requirements

Implement:

```text
/api/webhooks/billing/razorpay
```

Requirements:

- raw request body available for signature verification;
- verify Razorpay webhook signature using the configured secret;
- reject invalid signatures;
- record provider event ID;
- idempotency;
- safe logging;
- transactionally update WonderArk state;
- return success only after event is safely accepted.

Razorpay's security guidance explicitly calls for HMAC validation of webhook requests.

---

# 24. Stripe webhook requirements

Implement:

```text
/api/webhooks/billing/stripe
```

Requirements:

- use raw request body;
- verify Stripe webhook signature;
- use configured endpoint secret;
- reject invalid signatures;
- persist event ID;
- idempotently process;
- never trust client-returned checkout state as final payment state.

---

# 25. Provider event mapping

## Razorpay

Support the exact event set available in the configured Razorpay subscription integration.

At minimum design for:

```text
subscription.activated
subscription.pending
subscription.halted
payment captured/succeeded
payment failed
refund events where applicable
```

Do not hard-code unsupported events.

The adapter should maintain a provider-event mapping table.

---

## Stripe

Support at minimum:

```text
checkout.session.completed
customer.subscription.created
customer.subscription.updated
customer.subscription.deleted
invoice.paid
invoice.payment_failed
invoice.payment_action_required
```

Add provider events only when required by actual implementation.

Unhandled events must be safely recorded as:

```text
received
unhandled
```

They must not break webhook processing.

---

# 26. Checkout architecture

Customer clicks:

```text
Choose Pro
```

Browser sends:

```text
POST /api/billing/checkout
```

Payload should contain only:

```json
{
  "planId": "..."
}
```

Do NOT accept:

```text
amount
currency
providerPriceId
moduleIds
entitlements
```

from the browser as authoritative values.

Server resolves:

```text
authenticated user
      ↓
business
      ↓
eligible plan
      ↓
current entitlement
      ↓
provider routing
      ↓
provider price
      ↓
checkout
```

---

# 27. Checkout response

Return a provider-specific redirect/session result through a normalized response:

```ts
type CheckoutResult =
  | {
      provider: "stripe";
      mode: "redirect";
      url: string;
    }
  | {
      provider: "razorpay";
      mode: "checkout";
      checkoutOptions: SafeCheckoutOptions;
    };
```

Never return provider secrets.

Razorpay Key ID may be public client configuration where the official integration requires it; Key Secret must never reach the browser.

---

# 28. Success redirect

Use:

```text
/billing/success
```

The success page must show:

```text
Payment received
We're confirming your subscription.

Subscription status: Processing / Active
```

The page should poll/revalidate internal WonderArk state.

Do not say:

```text
Payment successful and all features activated
```

until WonderArk has trusted confirmation.

---

# 29. Failure redirect

Use:

```text
/billing/failed
```

Show:

- failure state;
- retry;
- return to billing;
- support path.

Never expose raw provider error payloads.

---

# 30. Customer billing page

Add a customer-facing billing area.

Recommended route:

```text
/[businessSlug]/settings/billing
```

or the existing account/billing location if the repository already has one.

The page should contain:

```text
Billing

Current Plan
Pro
₹9,999 / month

Status
Active

Next billing date
26 Oct 2026

Modules
✓ Discovery
✓ Inventory
✓ Service
✓ CRM
✓ Finance

[Change plan]
[Manage payment method]
[Cancel subscription]

Recent payments
...
```

---

# 31. Plan comparison UI

Pricing/upgrade UI should use the existing WonderArk visual language.

Example:

```text
                    Starter       Pro          Max
---------------------------------------------------------
Discovery             ✓            ✓            ✓
Inventory              -           ✓            ✓
Service                -           ✓            ✓
CRM                    -           ✓            ✓
Finance                -           ✓            ✓
AI limits             100         500          2000
Businesses              1           3            10

                 [Choose]      [Choose]       [Choose]
```

Use actual platform plan entitlements rather than hard-coded feature lists.

---

# 32. Plan purchase confirmation

Before redirecting to payment:

```text
Review your plan

Pro
₹9,999 / month

Includes:
• Discovery
• Inventory
• Service
• CRM
• Finance

Billing starts today.

[Back]
[Continue to payment]
```

The amount is server-derived.

---

# 33. Existing plan page integration

The existing:

```text
/platform/plans
```

is an administrative catalog.

Do not turn it into a customer pricing page.

Create a customer-facing pricing/billing surface using the same canonical plan records.

---

# 34. Platform Admin — Plans enhancement

Existing `/platform/plans` should be enhanced with:

```text
Plan
Price
Billing
Provider mapping
Entitlements
Status
Marketing
Subscribers
Revenue
Actions
```

Add an action:

```text
Billing configuration
```

---

# 35. Platform Admin — Plan billing configuration

For each plan:

```text
Billing Configuration

Plan: Pro

Currency       INR
Interval       Monthly
Amount         ₹9,999

Razorpay
Status: Configured
Product/Plan ID: plan_xxx
[Sync] [Test]

Stripe
Status: Configured
Product ID: prod_xxx
Price ID: price_xxx
[Sync] [Test]
```

Do not expose provider secrets.

---

# 36. Platform Admin — Billing dashboard

Create:

```text
/platform/billing
```

Dashboard cards:

```text
Active subscriptions
MRR
ARR
Failed payments
Past due
Cancellations
New subscriptions
Revenue this month
```

All metrics must be derived from actual WonderArk records.

Clearly label:

```text
Gross revenue
Net revenue
Provider fees
Refunds
```

only when each value is actually available.

---

# 37. Platform Admin — Subscriptions

Create:

```text
/platform/billing/subscriptions
```

Columns:

```text
Business
Plan
Provider
Status
Amount
Interval
Current period
Next renewal
Cancellation
Updated
```

Filters:

- provider;
- plan;
- status;
- date;
- business.

Actions:

```text
View
Sync
Cancel at period end
Resume
Change plan
```

Dangerous actions require confirmation.

---

# 38. Platform Admin — Payments

Create:

```text
/platform/billing/payments
```

Columns:

```text
Date
Business
Plan
Provider
Amount
Currency
Status
Payment method
Invoice/order
```

Filters:

- provider;
- status;
- plan;
- date;
- business.

Actions:

```text
View details
Sync provider state
Refund
```

Refund capability must be implemented only after explicit confirmation and provider support.

---

# 39. Platform Admin — Billing events

Create:

```text
/platform/billing/events
```

Columns:

```text
Received
Provider
Event
Provider event ID
Status
Attempts
Processed
```

Detail view:

```text
Event metadata
Processing history
Error
Related subscription
Related payment
```

Raw provider payload should be accessible only to authorized platform administrators and should be redacted/sanitized before display.

---

# 40. Platform Admin — Provider settings

Create:

```text
/platform/billing/providers
```

Sections:

```text
Razorpay
Stripe
```

Each shows:

```text
Enabled
Environment
Account status
Webhook status
Last successful webhook
Last failed webhook
Configuration completeness
```

Secrets:

- stored only server-side;
- encrypted/secret-managed according to existing platform configuration pattern;
- never rendered back to browser;
- never included in audit logs;
- never included in exports.

---

# 41. Provider configuration fields

## Razorpay

Conceptual:

```text
Key ID
Key Secret
Webhook Secret
Account/merchant identifier where applicable
Environment
```

## Stripe

Conceptual:

```text
Publishable Key
Secret Key
Webhook Signing Secret
Account identifier where applicable
Environment
```

The UI should show:

```text
Configured
```

rather than displaying secrets after save.

---

# 42. Environment separation

Both providers must support:

```text
Test
Live
```

Never mix test and live credentials.

Database records should identify environment.

Example:

```text
provider = stripe
environment = test
```

Unique provider IDs should include environment where appropriate.

---

# 43. Configuration safety

Changing a provider secret must require:

```text
Reason
```

matching existing Platform Admin configuration-versioning conventions.

Record:

```text
who
what
when
reason
```

Never record:

```text
old secret
new secret
```

---

# 44. Webhook health dashboard

Platform Admin should show:

```text
Razorpay
✓ Endpoint reachable
✓ Signature validation
✓ Last event 2 min ago
0 failed events

Stripe
✓ Endpoint reachable
✓ Signature validation
✓ Last event 5 min ago
1 failed event
```

A failed webhook must expose a safe error summary and retry state.

---

# 45. Subscription reconciliation

Create an administrative operation:

```text
Sync subscription
```

Flow:

```text
WonderArk subscription
        ↓
Provider API
        ↓
Compare state
        ↓
Show differences
        ↓
Admin confirms if correction required
        ↓
Apply deterministic reconciliation
```

Do not automatically overwrite WonderArk state with arbitrary provider values without mapping and validation.

---

# 46. Reconciliation states

Example:

```text
WonderArk:
Active

Stripe:
Past due
```

Display:

```text
State mismatch
WonderArk: Active
Stripe: Past due

[Review]
```

Do not hide discrepancies.

---

# 47. License provisioning service

Create a dedicated billing/license reconciliation service in `core`.

Conceptual:

```text
packages/core/src/billing/
packages/core/src/licensing/
```

The service should:

```text
resolvePlanEntitlements()
provisionPlanLicenses()
reconcilePlanLicenses()
scheduleLicenseChanges()
```

It should use the existing licensing functions rather than creating a second license system.

---

# 48. Provisioning algorithm

Pseudo-flow:

```text
function reconcileSubscription(subscriptionId):

  subscription = getSubscription(subscriptionId)

  plan = getCanonicalPlan(subscription.planId)

  entitlements = getPlanModuleEntitlements(plan.id)

  currentLicenses = getBusinessLicenses(subscription.businessId)

  for each licensed module:
      if entitlement active:
          ensure license exists
          ensure correct status
      else:
          schedule removal according to licensing policy

  record reconciliation result
```

Must be idempotent.

---

# 49. License ownership

The subscription should identify the commercial source of a license.

Conceptually extend existing license metadata or ownership relation with:

```text
source = subscription
subscription_id
plan_id
```

Do not create a duplicate `billing_licenses` authorization table.

`core.licenses` remains authoritative.

---

# 50. Multiple subscriptions

Default business rule:

**One active WonderArk platform subscription per business.**

Prevent accidental duplicate paid subscriptions.

If a customer already has an active subscription:

```text
You already have an active subscription.

[Manage current plan]
```

Stripe explicitly supports mechanisms to limit customers to one active subscription; WonderArk should enforce this in its own database as well.

---

# 51. Concurrent checkout protection

Two browser tabs must not create two subscriptions.

Implement an idempotency key.

Conceptual:

```text
platform.checkout_sessions
```

Fields:

```text
id
business_id
plan_id
provider
idempotency_key
provider_checkout_id
status
created_at
expires_at
```

Unique:

```text
business_id + idempotency_key
```

---

# 52. Checkout expiry

Checkout sessions must have an internal expiry.

If a stale session is reused:

```text
Session expired
Please start checkout again.
```

Do not create a second provider subscription accidentally.

---

# 53. Provider idempotency

Use provider-supported idempotency mechanisms where available.

Also enforce WonderArk-side idempotency.

Two layers are required:

```text
WonderArk idempotency
+
Provider idempotency
```

---

# 54. Upgrade/downgrade proration policy

Do not let each page invent its own proration rules.

Platform Admin should configure:

```text
Upgrade:
Immediate / Next renewal

Downgrade:
Next renewal / Immediate

Proration:
Enabled / Disabled
```

Default should favor predictable next-renewal downgrades.

For Stripe, provider-supported proration behavior must be used rather than manually calculating arbitrary prorations.

For Razorpay, use the capabilities supported by the configured subscription product/API and do not emulate unsupported behavior.

---

# 55. Invoice handling

The application should retain provider invoice references.

Do not make WonderArk responsible for recreating provider invoices.

Store:

```text
provider_invoice_id
invoice_number where available
invoice_url where safely available
amount
tax
currency
status
```

If provider-hosted invoice URLs are temporary/signed, generate them on demand rather than storing long-lived signed URLs.

---

# 56. India GST considerations

WonderArk should support billing metadata needed for Indian customers:

```text
billing name
billing address
GSTIN
state
country
```

Do not implement tax logic merely inside the frontend.

Tax calculation should be provider-supported or a deterministic WonderArk billing tax layer approved separately.

The implementation must distinguish:

```text
subtotal
discount
tax
total
currency
```

If GST is not yet configured for WonderArk billing, do not fabricate GST amounts.

---

# 57. International billing

Stripe should support international pricing where configured.

Razorpay may also support international payments/currencies subject to account configuration and payment-method eligibility.

Provider availability must therefore be configuration-driven, not hard-coded as:

```text
India = Razorpay
Everything else = Stripe
```

The admin controls the actual routing policy.

---

# 58. Billing currency

Supported currencies must be explicitly configured.

A checkout request for an unsupported currency must fail safely:

```text
This plan is not available in your billing currency.
```

Do not silently convert the price in application code unless the pricing model explicitly supports it.

---

# 59. Subscription state machine

WonderArk normalized state:

```text
incomplete
    |
    v
active <----------------+
    |                   |
    | payment failure   | payment recovered
    v                   |
past_due ---------------+
    |
    v
unpaid / halted
    |
    v
cancel_scheduled
    |
    v
cancelled
```

Provider-specific states are mapped into this normalized model.

Do not assume the same state names between Razorpay and Stripe.

---

# 60. Billing notifications

Use the existing notification system.

Events:

- payment successful;
- payment failed;
- payment action required;
- subscription activated;
- upgrade completed;
- downgrade scheduled;
- cancellation scheduled;
- subscription cancelled;
- invoice available;
- payment method needs update.

Do not create a separate notification system.

---

# 61. Billing emails

Use the existing email provider/template architecture.

Suggested templates:

```text
billing_payment_success
billing_payment_failed
billing_subscription_activated
billing_subscription_cancelled
billing_upgrade
billing_downgrade
billing_payment_method_required
```

Do not send email directly from webhook code.

Publish a domain event and let the existing background job/email mechanism process it.

---

# 62. Audit requirements

Use existing `core.audit_log`.

Events:

```text
billing.checkout_started
billing.checkout_completed
billing.payment_succeeded
billing.payment_failed
billing.subscription_created
billing.subscription_updated
billing.subscription_cancelled
billing.plan_changed
billing.license_reconciled
billing.webhook_received
billing.webhook_failed
billing.refund_created
```

Audit payload should contain metadata, not secrets.

---

# 63. Security requirements

Mandatory:

- provider secrets server-side only;
- webhook signature verification;
- raw-body verification;
- idempotency;
- RLS;
- tenant/business authorization;
- platform admin authorization;
- no browser service-role key;
- no payment credentials stored;
- safe logs;
- no provider secrets in audit;
- no secrets in AI context;
- no secrets in error messages.

---

# 64. Secret storage

Inspect the repository's existing secret/configuration pattern before implementation.

Do not introduce a new secret storage mechanism unless required.

Environment variables may be used for deployment-level secrets.

Platform-configured secrets should use the existing secure configuration architecture.

Example environment names:

```text
RAZORPAY_KEY_ID
RAZORPAY_KEY_SECRET
RAZORPAY_WEBHOOK_SECRET

STRIPE_PUBLISHABLE_KEY
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
```

If platform admins must manage credentials at runtime, use the existing encrypted platform configuration approach instead.

---

# 65. Never expose provider secrets

The following must never be returned to a browser:

```text
RAZORPAY_KEY_SECRET
RAZORPAY_WEBHOOK_SECRET
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
```

A public Stripe publishable key and Razorpay Key ID may be returned only where required by their client-side checkout integration.

---

# 66. Database/RLS

All new platform billing tables belong in:

```text
platform
```

because they are platform control-plane data.

However, customer-facing queries must always scope through the authenticated business.

Platform Admin queries require platform-admin authorization.

Do not make billing tables globally readable.

---

# 67. Migration strategy

Before creating migrations:

1. inspect current platform schema;
2. inspect existing plans;
3. inspect existing licenses;
4. inspect existing payments;
5. inspect background jobs;
6. inspect audit log;
7. inspect platform configuration tables.

Reuse existing entities if equivalent.

Never create:

```text
platform.licenses
platform.billing_licenses
platform.module_subscriptions
```

if an existing canonical entity already owns that responsibility.

---

# 68. Recommended new tables

Only create these if an equivalent does not already exist:

```text
platform.plan_prices
platform.billing_customers
platform.subscriptions
platform.payments
platform.billing_events
platform.checkout_sessions
platform.billing_provider_config
```

Potential optional:

```text
platform.refunds
platform.subscription_changes
```

Use existing payment/document entities where the repository already has a canonical representation.

---

# 69. Platform navigation

Extend Platform Admin navigation with:

```text
Billing
├── Overview
├── Subscriptions
├── Payments
├── Plans
├── Providers
└── Events
```

Existing `/platform/plans` remains the canonical plan catalog.

Do not duplicate it under another page.

---

# 70. Platform Billing Overview UI

Desktop:

```text
┌─────────────────────────────────────────────────────────────┐
│ Billing                                      [Configure]    │
│ Subscription and payment operations                         │
├────────────┬────────────┬────────────┬─────────────────────┤
│ Active     │ MRR        │ Failed     │ Cancellations       │
│ 1,284      │ ₹42.8L     │ 17         │ 23                  │
├────────────┴────────────┴────────────┴─────────────────────┤
│ Revenue Trend                                               │
│                                                             │
│              chart                                          │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│ Recent Billing Events                                       │
│ Business | Plan | Provider | Event | Status | Time          │
└─────────────────────────────────────────────────────────────┘
```

Use the existing platform dark administration chrome.

---

# 71. Platform Plans UI enhancement

Existing table:

```text
Plan | Price | Status | Order | Marketing | Actions
```

Add:

```text
Billing
Subscribers
```

Example:

```text
Pro
₹9,999 / month
Razorpay ✓
Stripe ✓
1,284 subscribers
```

Mobile cards must preserve the same information without horizontal scrolling.

---

# 72. Plan billing dialog

Add a billing configuration tab/dialog:

```text
Pro

Pricing
--------------------------------
INR
Monthly
₹9,999

Razorpay
--------------------------------
Product/Plan ID
Subscription status
[Create / Sync]

Stripe
--------------------------------
Product ID
Price ID
Subscription status
[Create / Sync]

[Cancel] [Save]
```

Provider IDs are not secrets.

---

# 73. Customer billing UI

Use the normal WonderArk light theme.

```text
Billing

Current plan
┌─────────────────────────────────────┐
│ Pro                                  │
│ ₹9,999 / month                       │
│ Active                               │
│ Next billing: 26 Oct 2026            │
│                                      │
│ [Change plan] [Manage billing]       │
└─────────────────────────────────────┘

Included modules
✓ Discovery
✓ Inventory
✓ Service
✓ CRM
✓ Finance

Recent payments
────────────────────────────────────
26 Sep   ₹9,999   Paid
26 Aug   ₹9,999   Paid
26 Jul   ₹9,999   Paid
```

---

# 74. Manage billing

For Stripe:

Use Stripe Customer Portal where appropriate.

For Razorpay:

Implement the equivalent supported provider flow or WonderArk-hosted controls using the provider API.

Normalize the UI so customers see:

```text
Manage payment method
View invoices
Update billing details
Cancel subscription
```

but the underlying implementation may differ by provider.

---

# 75. Provider-neutral customer experience

Do not display unnecessary provider complexity.

Avoid:

```text
Manage Stripe subscription
```

Show:

```text
Manage billing
```

Only show provider-specific terminology when required to resolve an issue.

---

# 76. Payment history

Customer:

```text
Billing → Payment history
```

Columns:

```text
Date
Description
Amount
Currency
Status
Invoice
```

Actions:

```text
View invoice
```

Do not expose provider internal IDs unless useful for support.

---

# 77. Billing support information

For failed payment:

```text
Payment needs attention

We couldn't confirm your latest payment.

[Update payment method]
[Try again]
```

For webhook/provisioning delay:

```text
Payment received

We're still confirming your subscription.
Your plan will update automatically once confirmation completes.
```

This is important because provider confirmation and application provisioning may be asynchronous.

---

# 78. Refund handling

Refunds should be provider-driven.

Admin flow:

```text
Payment
  ↓
Refund
  ↓
Enter amount
  ↓
Reason
  ↓
Confirm
  ↓
Provider refund API
  ↓
Verified result/webhook
  ↓
Update WonderArk payment
```

Never mark a payment refunded before trusted provider confirmation.

---

# 79. Refund effect on licenses

A refund does not automatically imply license revocation.

The final behavior must follow the subscription state and explicit WonderArk billing policy.

For example:

```text
Refund due to accidental duplicate payment
→ subscription remains active
```

versus:

```text
Full cancellation/refund
→ subscription cancellation policy applies
```

Do not implement a simplistic:

```text
refund = revoke all licenses
```

rule.

---

# 80. Disputes/chargebacks

Design payment state to accommodate:

```text
disputed
chargeback
```

even if full dispute management is not implemented initially.

Do not treat a chargeback as a normal payment failure.

---

# 81. Testing strategy

## Unit tests

Test:

- provider mapping;
- plan lookup;
- price resolution;
- checkout idempotency;
- subscription state mapping;
- license provisioning;
- license reconciliation;
- cancellation;
- upgrade;
- downgrade;
- webhook deduplication;
- signature failure;
- invalid provider events.

---

# 82. Provider adapter tests

Mock provider SDK/API responses.

Do not make tests depend on live payment providers.

Test:

```text
Razorpay success
Razorpay failure
Razorpay duplicate webhook
Razorpay invalid signature

Stripe success
Stripe failure
Stripe duplicate webhook
Stripe invalid signature
```

---

# 83. Tenant isolation tests

Create:

```text
Business A
Business B
```

A must never see:

- B subscription;
- B payments;
- B checkout sessions;
- B billing customer;
- B invoice.

---

# 84. Platform authorization tests

Non-platform-admin users must not access:

```text
/platform/billing
/platform/billing/subscriptions
/platform/billing/payments
/platform/billing/providers
/platform/billing/events
```

---

# 85. License tests

Test:

```text
Pro purchased
→ Discovery license created
→ Inventory license created
→ Service license created
→ CRM license created
→ Finance license created
```

Then:

```text
Downgrade
→ removed modules follow cancellation/grace rules
```

---

# 86. Duplicate webhook test

Send the exact same webhook twice.

Expected:

```text
billing_events = 1
subscription mutation = 1
license reconciliation = 1
audit event = controlled/idempotent
```

---

# 87. Browser success spoofing test

Simulate:

```text
/browser?payment=success
```

without trusted provider confirmation.

Expected:

```text
No paid subscription
No paid licenses
```

This test is mandatory.

---

# 88. Checkout tampering tests

Change browser payload:

```json
{
  "planId": "free",
  "amount": 1,
  "currency": "INR",
  "providerPriceId": "attacker-price"
}
```

Expected:

- amount ignored;
- currency ignored;
- provider price ignored;
- server resolves canonical plan;
- authorization remains correct.

---

# 89. Secret leakage tests

Search generated logs/audit responses for:

```text
rzp_secret
stripe_secret
webhook_secret
```

Expected:

```text
not present
```

---

# 90. E2E test — new customer

```text
Create account
→ Create business
→ Open Pricing
→ Choose Pro
→ Checkout test provider
→ Payment success
→ Webhook
→ Subscription Active
→ Licenses provisioned
→ Discovery available
→ Inventory available
→ Service available
→ CRM available
→ Finance available
```

Use provider test/sandbox environments only.

---

# 91. E2E test — failed payment

```text
Active subscription
→ simulate payment failure
→ webhook
→ subscription past_due
→ notification
→ billing UI shows payment attention
→ licenses follow configured grace policy
```

---

# 92. E2E test — cancellation

```text
Active
→ Cancel
→ cancel_at_period_end
→ UI shows scheduled cancellation
→ current modules remain available
→ period end event
→ WonderArk license cancellation/grace process
```

---

# 93. E2E test — upgrade

```text
Starter
→ choose Pro
→ checkout/proration
→ provider confirmation
→ WonderArk subscription changes
→ new module licenses provisioned
```

---

# 94. E2E test — downgrade

```text
Pro
→ choose Starter
→ downgrade scheduled
→ current period remains Pro
→ next period begins
→ removed modules follow licensing policy
```

---

# 95. Background jobs

Do not perform slow operations inside webhook request handling.

Webhook should:

```text
verify
persist
enqueue/trigger processing
respond
```

Use the existing `core.domain_events` / background job architecture.

---

# 96. Webhook processing retries

If processing fails after signature validation:

```text
billing_events.processing_status = failed
```

and retry through the existing job mechanism.

Do not require the provider to resend indefinitely when WonderArk can safely retry internally.

---

# 97. Error handling

Customer-facing error:

```text
We couldn't start checkout.
Please try again.
```

Admin-facing error:

```text
Checkout provider rejected the request.
Provider: Stripe
Operation: create_checkout
Error code: ...
```

Never expose:

- access tokens;
- request authorization headers;
- secret keys;
- raw sensitive provider payloads.

---

# 98. Observability

Add structured logs for:

```text
billing.checkout
billing.webhook
billing.subscription
billing.payment
billing.license_reconciliation
```

Include:

```text
business_id
subscription_id
provider
operation
status
duration
```

Do not include:

```text
payment credentials
card data
full customer payload
secret values
```

---

# 99. Metrics

Useful platform metrics:

```text
checkout_started
checkout_completed
checkout_failed
subscription_activated
subscription_cancelled
payment_succeeded
payment_failed
webhook_received
webhook_failed
license_reconciliation_failed
```

These may feed the existing platform analytics/AI usage architecture where appropriate.

---

# 100. AI integration rule

Do not allow AI to:

- select a plan for a user without user confirmation;
- authorize a payment;
- alter a subscription;
- refund a payment;
- grant a license;
- revoke a license.

AI may:

- explain plans;
- summarize billing history;
- explain a payment failure;
- draft support responses.

All payment/license actions remain deterministic.

---

# 101. Security review checklist

Before production:

- [ ] webhook signature verified;
- [ ] raw body verified;
- [ ] duplicate event protection;
- [ ] tenant isolation;
- [ ] admin RBAC;
- [ ] no browser secret;
- [ ] no service-role browser usage;
- [ ] no sensitive logging;
- [ ] no secret audit data;
- [ ] provider environment separation;
- [ ] checkout tamper protection;
- [ ] license reconciliation idempotency;
- [ ] refund authorization;
- [ ] cancellation authorization;
- [ ] provider API timeouts;
- [ ] safe retry behavior;
- [ ] rate limiting on checkout/webhooks;
- [ ] replay protection;
- [ ] no duplicate subscriptions.

---

# 102. Recommended implementation phases

## Phase A — Billing foundation

### BILL-01
Inspect existing plans, licenses, payments, platform schema and background jobs.

### BILL-02
Create provider abstraction.

### BILL-03
Create platform billing tables/migrations.

### BILL-04
Create Razorpay adapter.

### BILL-05
Create Stripe adapter.

### BILL-06
Create provider configuration.

---

## Phase B — Checkout

### BILL-07
Create plan pricing/provider mapping.

### BILL-08
Create checkout session service.

### BILL-09
Create customer-facing pricing page.

### BILL-10
Create checkout confirmation page.

### BILL-11
Create success/failure pages.

---

## Phase C — Webhooks and subscription lifecycle

### BILL-12
Razorpay webhook.

### BILL-13
Stripe webhook.

### BILL-14
Event idempotency.

### BILL-15
Subscription synchronization.

### BILL-16
Payment synchronization.

### BILL-17
License provisioning.

### BILL-18
License reconciliation.

---

## Phase D — Customer billing

### BILL-19
Billing page.

### BILL-20
Payment history.

### BILL-21
Manage billing.

### BILL-22
Upgrade.

### BILL-23
Downgrade.

### BILL-24
Cancellation.

### BILL-25
Failed payment recovery.

---

## Phase E — Platform Admin

### BILL-26
Billing Overview.

### BILL-27
Subscriptions.

### BILL-28
Payments.

### BILL-29
Providers.

### BILL-30
Billing Events.

### BILL-31
Plan provider mappings.

### BILL-32
Subscription reconciliation.

---

## Phase F — Production hardening

### BILL-33
Audit.

### BILL-34
Notifications.

### BILL-35
Email templates.

### BILL-36
Observability.

### BILL-37
Security tests.

### BILL-38
Tenant/RBAC/license tests.

### BILL-39
E2E provider sandbox tests.

### BILL-40
Production readiness review.

---

# 102a. Story index

Every story in §102, in one table -- the progress tracker
(`scripts/build-progress-tracker.mjs`) reads story ids from this table, and code cites them
(e.g. `BILL-12`) as evidence of implementation.

| ID | Story |
|---|---|
| `BILL-01` | Inspect existing plans, licenses, payments, platform schema and background jobs |
| `BILL-02` | Create provider abstraction |
| `BILL-03` | Create platform billing tables/migrations |
| `BILL-04` | Create Razorpay adapter |
| `BILL-05` | Create Stripe adapter |
| `BILL-06` | Create provider configuration |
| `BILL-07` | Create plan pricing/provider mapping |
| `BILL-08` | Create checkout session service |
| `BILL-09` | Create customer-facing pricing page |
| `BILL-10` | Create checkout confirmation page |
| `BILL-11` | Create success/failure pages |
| `BILL-12` | Razorpay webhook |
| `BILL-13` | Stripe webhook |
| `BILL-14` | Event idempotency |
| `BILL-15` | Subscription synchronization |
| `BILL-16` | Payment synchronization |
| `BILL-17` | License provisioning |
| `BILL-18` | License reconciliation |
| `BILL-19` | Billing page |
| `BILL-20` | Payment history |
| `BILL-21` | Manage billing |
| `BILL-22` | Upgrade |
| `BILL-23` | Downgrade |
| `BILL-24` | Cancellation |
| `BILL-25` | Failed payment recovery |
| `BILL-26` | Billing Overview |
| `BILL-27` | Subscriptions |
| `BILL-28` | Payments |
| `BILL-29` | Providers |
| `BILL-30` | Billing Events |
| `BILL-31` | Plan provider mappings |
| `BILL-32` | Subscription reconciliation |
| `BILL-33` | Audit |
| `BILL-34` | Notifications |
| `BILL-35` | Email templates |
| `BILL-36` | Observability |
| `BILL-37` | Security tests |
| `BILL-38` | Tenant/RBAC/license tests |
| `BILL-39` | E2E provider sandbox tests |
| `BILL-40` | Production readiness review |

---

# 103. Claude Code execution protocol

Claude Code should execute this specification autonomously.

For each story:

1. Pull latest `main`.
2. Inspect relevant existing implementation.
3. Search before creating a new table.
4. Reuse canonical plan/license/payment entities.
5. Inspect RLS.
6. Inspect platform authorization.
7. Inspect existing configuration/versioning patterns.
8. Inspect existing background-job/event patterns.
9. Implement the smallest compatible change.
10. Add tests.
11. Run:
   - typecheck;
   - lint;
   - boundary lint;
   - migration checks;
   - focused tests;
   - full test suite.
12. Update progress tracker.
13. Commit focused changes.
14. Push to `main` according to repository workflow.
15. Continue to the next story without routine clarification.

---

# 104. Definition of done

The integration is complete only when a customer can:

```text
Create business
    ↓
View WonderArk plans
    ↓
Select plan
    ↓
Checkout using configured Razorpay or Stripe
    ↓
Payment/subscription confirmed
    ↓
WonderArk subscription activated
    ↓
Required licenses provisioned
    ↓
Modules available
```

and an existing customer can:

```text
View current plan
Manage billing
View payments
Upgrade
Downgrade
Cancel
Recover failed payment
```

while Platform Admin can:

```text
Create/edit plans
Configure provider pricing
Configure Razorpay
Configure Stripe
View subscriptions
View payments
View webhook events
Reconcile subscriptions
View billing metrics
Manage billing operations
```

with:

```text
tenant isolation
+
RLS
+
RBAC
+
provider signature verification
+
idempotency
+
auditability
+
secure secret handling
+
deterministic license provisioning
```

---

# 105. Final architecture

The intended final system is:

```text
                         WONDERARK
                             │
                     Platform Plan Catalog
                             │
                     ┌───────┴────────┐
                     │                │
                 Razorpay           Stripe
                     │                │
                     └───────┬────────┘
                             │
                         Checkout
                             │
                         Payment
                             │
                      Subscription
                             │
                       Webhook/Event
                             │
                  Billing Reconciliation
                             │
                    Canonical Plan
                             │
                    Plan Entitlements
                             │
                     core.licenses
                             │
        ┌────────────────────┼────────────────────┐
        │                    │                    │
    Discovery            Inventory             Service
        │                    │                    │
       CRM                 Finance             Future
```

The key principle is:

> **Payment providers collect and report money; WonderArk owns the commercial plan, subscription state used by the product, entitlements and licenses.**

This separation prevents payment-provider behavior from becoming an accidental authorization system and keeps WonderArk's existing licensing architecture intact.
