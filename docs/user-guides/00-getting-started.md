# Getting Started

## 1. Creating an account

Go to **Sign up**. You'll need:

- **Email** (required)
- **Password** (required, minimum 8 characters)
- **Name** (optional)

Or use **Continue with Google** to skip the password step entirely.

After signing up with email/password, check your inbox and confirm your
email address before you can log in — the signup page shows a "check your
email" screen as a reminder. If you signed up with Google, you're taken
straight into the onboarding wizard.

**Forgot your password?** Use the "Forgot password?" link on the login page.

## 2. Onboarding: your first business

New accounts land in a short onboarding wizard rather than a bare "create
business" form. You'll be asked for:

1. A short **description of what your business sells or does**.
2. Your **website URL** — WonderArk visits it and researches your business
   automatically (products, positioning, audience) to save you re-typing
   things you've already published.
3. A short description of your **target audience**.

WonderArk uses this to create your business, create your first offering, and
run an initial AI analysis (ideal customer profile, etc.) so your Discovery
dashboard isn't empty on day one. You don't need to name your business
yourself in this step — a name is derived from your description and can be
changed later.

## 3. Businesses, offerings, and why there are two concepts

This trips up new users, so it's worth explaining once:

- A **business** is your one shared operational back office: one inventory,
  one tax registration, one crew, one customer ledger — regardless of how
  many things you sell.
- A **business offering** (managed inside the Discovery module) is one
  product or service line you market — its own ideal customer profile, its
  own prospect list, its own AI usage. A single business can have several
  offerings (e.g. a hardware store that also does installation), each with
  its own Discovery pipeline, but they all still share the *same* Inventory
  stock, the *same* GST/tax registrations, and the *same* CRM customer
  records underneath.

In short: **offerings are "what you sell,"** and they sit *on top of* a
single shared business. Inventory, Service, CRM, and Compliance all operate
at the business level; only Discovery operates per-offering.

## 4. Switching between businesses and modules

- The **business switcher** (top bar) lists every business on your account.
  Pin the ones you use most so they float to the top; there's always a
  "+ Create New Business" option at the bottom.
- The **module selector** (sidebar) switches between a business's *licensed
  modules* (Discovery / Inventory / Service / CRM / Compliance). An
  unlicensed module still shows in the list, greyed out with a lock icon —
  clicking it explains that it isn't licensed yet rather than crashing. You
  can also "pin" to one module to keep the sidebar focused on just that
  module until you unpin it.

## 5. Licensing a module

Go to **Settings → Licenses**. For each of your businesses you'll see every
module with a status:

| Status | Meaning |
|---|---|
| Active | Fully usable |
| Cancels *\<date\>* | You cancelled, but keep full access until the current billing cycle ends |
| Grace · *N*d left | Past cancellation — read-only access only, counting down a 30-day window |
| Expired / Cancelled | No access; your data is retained, never deleted |
| Not licensed | Never activated |

Buttons let you **Activate** a module, **Cancel** an active one (a confirm
dialog explains the grace period before you commit), **Reactivate** during
grace or after cancellation (this restores full access and replays anything
that was queued up while you were on hold), or **Undo cancellation** while
it's still pending.

Cancelling a module **never deletes your data** — worst case you get a
30-day read-only window, then the module is simply inaccessible until you
reactivate.

## 6. Billing and AI credits

**Settings → Billing** is account-wide (not per business):

- Connect your own AI provider key (OpenAI, Anthropic, or Google Gemini) so
  AI features run on your own account, or leave it on **App Internal AI** to
  use WonderArk's shared credits instead — no key required, capped by your
  plan's free-tier allowance.
- **Buy AI credits** if you're on App Internal AI and need more headroom.
- A pricing-tier comparison table for reference (Free is the only plan you
  can actually purchase today).

**Settings → Usage** shows your account-wide AI usage this month, remaining
credit balance, and a breakdown per business/offering (each Discovery
offering has its own separate free-tier allowance, so there's no single
blended percentage across your account).

## 7. Team & permissions

**\<business\> → Admin → Team** is the one shared place — across every
module — where you see:

- Every member of the business and their role.
- The eight built-in roles (**Owner, Admin, Inventory Manager, Procurement
  Manager, Sales Manager, Accountant, Warehouse Operator, Viewer**) and,
  for each one, exactly which permissions it grants, grouped by module.

Today this page is **read-only** — it's where you check what a role can do,
not yet where you invite people or reassign roles (custom roles and
in-app role assignment are on the roadmap). Note that only **Owner** and
**Admin** can touch module-configuration screens like CRM's channel
connections or routing rules — operating roles like Sales Manager can work
the pipeline but not reconfigure integrations.

## 8. API keys

**\<business\> → Admin → API Keys** manages keys for WonderArk's public REST
API, which every licensed module exposes resources through. Generating and
revoking keys requires the `settings.manage` permission (Owner/Admin by
default).

## 9. The Superadmin Platform Portal

If you operate a WonderArk deployment (rather than just using one), there is
a separate staff-only control plane at `/platform` — global branding, plans,
feature entitlements, usage limits, which modules exist at all, internal AI
provider keys, and so on. It's not a licensable module and ordinary business
admins never see it; it exists for whoever runs the WonderArk service
itself.

## 10. Environment variables (for whoever deploys WonderArk)

If you're standing up your own instance, `apps/web/.env.example` documents
every variable. Grouped by purpose:

| Purpose | Variables |
|---|---|
| Supabase connection | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (server-only, never expose to the browser) |
| Branding | `NEXT_PUBLIC_BRAND_NAME` (defaults to "WonderArk") |
| Outbound email | `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `RESEND_WEBHOOK_SECRET` |
| Inbound email | `EMAIL_INBOUND_WEBHOOK_SECRET` |
| AI credit purchases | `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` — optional; leaving these unset just disables the "buy credits" flow |
| BYOK key encryption | `API_KEY_ENCRYPTION_SECRET` — a 32-byte base64 secret; **never rotate this once customers have connected keys**, it makes every stored key permanently undecryptable |
| Platform-wide AI fallback | `PLATFORM_AI_API_KEY` — optional; lets accounts without their own key still use AI features, against their normal usage caps |
| Scheduled jobs | `CRON_SECRET` — checked on the background event-drain endpoint |
| Internal demo-data tool | `PLATFORM_ADMIN_EMAILS` — comma-separated allowlist for `/dashboard/admin` (distinct from the `/platform` superadmin portal) |
| CRM channel webhooks | `CRM_META_APP_SECRET`, `CRM_META_WEBHOOK_VERIFY_TOKEN`, `CRM_WHATSAPP_APP_SECRET`, `CRM_WHATSAPP_WEBHOOK_VERIFY_TOKEN` — see the [CRM guide](./04-crm.md#connecting-a-channel-whatsapp--instagram--facebook) |
| SEO | `NEXT_PUBLIC_SITE_URL` — optional, falls back to the current deployment URL |

None of this is needed by an ordinary business user signing up on an
existing WonderArk deployment — it's only relevant to whoever operates the
deployment itself.
