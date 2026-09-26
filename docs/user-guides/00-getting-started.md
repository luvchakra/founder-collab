# Getting Started

Everything from your first login to a working business: creating an account,
setting up your first business, understanding how businesses and offerings
differ, licensing the modules you need, and adding your team. The last two
sections are for whoever operates the deployment rather than for everyday
users.

## 1. Creating an account

Go to **Sign up**. You'll need:

- **Email** (required)
- **Password** (required, minimum 8 characters)
- **Name** (optional)

Or use **Continue with Google** to skip the password step entirely. The
Google button only appears if the deployment's Supabase project actually has
Google sign-in switched on — see §13 if you operate the deployment and want
to enable it.

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
single shared business. Inventory, Service, CRM, and Finance all operate
at the business level; only Discovery operates per-offering.

## 4. Switching between businesses and modules

- The **business switcher** (top bar) lists every business on your account.
  Pin the ones you use most so they float to the top; there's always a
  "+ Create New Business" option at the bottom.
- The **module selector** (sidebar) switches between a business's *licensed
  modules* (Discovery / Inventory / Service / CRM / Finance). An
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

## 6. Plans, billing and AI credits

Each business has its own plan. Open **\<business\> → Billing** to see the
current plan, the modules it includes and your next payment date.

- **Change plan** opens **Choose your plan**. Pick a plan and billing
  period, check the **Review your plan** summary, then pay through the
  secure checkout (card or UPI, depending on your region). Licences update
  as soon as the payment is confirmed; the success page says so.
- If a payment doesn't go through, nothing changes — you stay on your
  current plan and can try again.
- **Payment history** lists every payment and receipt. WonderArk never
  stores card details.
- **Cancel subscription** keeps full access until the end of the paid
  period, then the modules move to the 30-day read-only grace described in
  §5. Your data is never deleted.

Changing or cancelling a plan needs the `billing.subscription.change`
permission (the Owner, plus anyone the business grants it to); seeing
payments needs `billing.view`.

**Settings → Billing** (account-wide) is where AI is configured:

- Connect your own AI provider key (OpenAI, Anthropic, or Google Gemini) so
  AI features run on your own account, or leave it on **App Internal AI** to
  use WonderArk's included credits — no key required, capped by your plan's
  allowance.
- **Buy AI credits** if you're on App Internal AI and need more headroom.

**Settings → Usage** shows your account-wide AI usage this month, remaining
credit balance, and a breakdown per business and offering. Repeated AI
requests are cached, so asking for the same research twice doesn't cost
twice.

## 7. Users, roles and invitations

**\<business\> → Admin → Users & Access** is where you manage who can use a
business and what they can do. Everything here is per business: someone can
be an Admin in one business and a Viewer in another.

- **Invite user** sends an email invitation with a role. The link works for
  7 days, only for the email address it was sent to, and only once.
  Someone without an account signs up from the link and lands straight back
  on the invitation. Pending invitations can be revoked.
- **Change a role** from the user's details; it takes effect on their next
  page load. You can never give someone more than you hold yourself, and
  nobody can change their own role.
- **Suspend** removes access immediately without losing the person's history;
  reactivate to restore it. **Remove** ends their membership.
- **Transfer ownership** hands the Owner role to another member (the old
  owner becomes an Admin). A business always keeps at least one Owner.
- **Activity** shows every invitation, role change and suspension.

**System roles** — Owner, Admin, Sales Manager, Accountant, Inventory
Manager, Procurement Manager, Warehouse Operator and Viewer — each show
exactly which permissions they grant, grouped by module. For anything else,
**Create role** builds a **custom role** from a template (Sales Manager,
Marketing Manager, Finance Manager, Operations Manager, Field Technician,
Accountant, Viewer…) that you then adjust.

Roles are enforced in the database, not just hidden in the menus:

- A role only sees the modules it has permission for, even when the business
  licenses more. A **Viewer** can read everything licensed and change
  nothing.
- A role that works in one module can still trigger the hand-offs that
  module owns — a Sales Manager creating a service quote from a CRM
  opportunity, or a technician reserving parts for a job — without being
  given the rest of the other module.
- If someone opens a page their role doesn't allow, they see a
  "you don't have permission" page, which is different from the
  "not in your plan" page for a module the business hasn't licensed.

## 8. API keys

**\<business\> → Admin → API Keys** manages keys for WonderArk's public REST
API, which every licensed module exposes resources through. A key is shown
once when it's created; revoke it here and it stops working immediately.
Generating and revoking keys requires the `settings.manage` permission
(Owner/Admin by default).

## 9. Exporting your data

Most lists have an **Export** button: choose **CSV** or **Excel**. The file
contains what you're looking at — the same filters, search and columns.
Large exports run in the background and you get a download link (and a
notification) when the file is ready; download links expire after a few
days. Exports respect permissions: each module has its own export
permission (for example `crm.export` or `finance.reports.export`), and every
export is recorded in the audit log.

## 10. Appearance

**Settings → Appearance** switches between **Light**, **Dark** and
**System** (follows your device). The choice is saved on the device you set
it on.

## 11. The Superadmin Platform Portal

If you operate a WonderArk deployment (rather than just using one), there is
a separate staff-only control plane at `/platform` — global branding, plans
and prices, feature entitlements, usage limits, which modules exist at all,
internal AI provider keys, subscription and payment records, and so on. It
is protected by multi-factor sign-in, and every change there is recorded in
the platform audit log and configuration history.

A superadmin can also switch off a single AI feature for everyone (for
example, AI outreach drafts) from **AI feature policies**, without turning
off the module or any other AI feature — each switch needs a reason and is
audited. It's not a licensable module and ordinary business admins never
see it; it exists for whoever runs the WonderArk service itself.

## 12. Environment variables (for whoever deploys WonderArk)

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
| Platform-wide AI fallback | `PLATFORM_AI_API_KEY` — optional; lets accounts without their own key still use AI features, against their normal usage caps. A key set on the superadmin portal's **AI Providers** page takes precedence over this variable, and needs no redeploy |
| Scheduled jobs | `CRON_SECRET` — checked on the background event-drain endpoint |
| Internal demo-data tool | `PLATFORM_ADMIN_EMAILS` — comma-separated allowlist for `/dashboard/admin` (distinct from the `/platform` superadmin portal) |
| CRM channel webhooks | `CRM_META_APP_SECRET`, `CRM_META_WEBHOOK_VERIFY_TOKEN`, `CRM_WHATSAPP_APP_SECRET`, `CRM_WHATSAPP_WEBHOOK_VERIFY_TOKEN` — see the [CRM guide](./04-crm.md#connecting-a-channel-whatsapp--instagram--facebook) |
| SEO | `NEXT_PUBLIC_SITE_URL` — optional, falls back to the current deployment URL |

None of this is needed by an ordinary business user signing up on an
existing WonderArk deployment — it's only relevant to whoever operates the
deployment itself.

## 13. Enabling Google sign-in (for whoever deploys WonderArk)

The application code for Google sign-in is already in place — the
"Continue with Google" button, the OAuth redirect, and the
`/auth/callback` handler that turns Google's response into a session. What
it needs is credentials, and those are configured outside the codebase, in
two places. Until they exist the button is hidden rather than shown and
broken, so enabling Google is a configuration change only: nothing to
deploy, nothing to rebuild.

### Step 1 — Create OAuth credentials in Google Cloud

1. Open the [Google Cloud Console](https://console.cloud.google.com/) and
   select (or create) a project for this deployment.
2. **APIs & Services → OAuth consent screen.** Choose **External** unless
   every user will have an account in your own Google Workspace, then fill
   in the app name, a support email, and your logo. Add the scopes
   `.../auth/userinfo.email`, `.../auth/userinfo.profile` and `openid` —
   these are the defaults and are all WonderArk asks for.
   While the consent screen is in **Testing**, only the accounts you list
   as test users can sign in; **Publish** it before go-live.
3. **APIs & Services → Credentials → Create credentials → OAuth client ID.**
   Application type: **Web application**.
4. Under **Authorised JavaScript origins**, add the origins people will
   actually load the app from — e.g. `https://your-domain.com` and, for
   local work, `http://localhost:3000`.
5. Under **Authorised redirect URIs**, add **one** URI, and it is Supabase's,
   not your app's:

   ```
   https://<your-project-ref>.supabase.co/auth/v1/callback
   ```

   This is the single most common thing to get wrong. Google redirects to
   Supabase, and Supabase then redirects to WonderArk's own
   `/auth/callback` — so your own domain does not belong in this field. A
   mismatch here shows up as `redirect_uri_mismatch` at sign-in time.
6. Copy the **Client ID** and **Client secret**.

### Step 2 — Turn the provider on in Supabase

1. Open the Supabase dashboard for this deployment's project →
   **Authentication → Providers → Google**.
2. Toggle it **Enabled**, paste the Client ID and Client secret, and save.
3. Still in Authentication, check **URL Configuration**:
   - **Site URL** — your production origin (e.g. `https://your-domain.com`).
   - **Redirect URLs** — add `https://your-domain.com/auth/callback`, plus
     `http://localhost:3000/auth/callback` for local development and a
     wildcard for preview deployments if you use them
     (e.g. `https://*-your-team.vercel.app/auth/callback`).

   WonderArk always asks Supabase to send people back to
   `{origin}/auth/callback`, taking the origin from the request itself, so
   the same build works in local dev, previews and production — but every
   origin you want that to work from has to be on this allowlist.

That is the whole of it. Within five minutes (the button's cached view of
the project's settings) — or immediately on the next cold start — the
Google button appears on both the login and signup pages.

### Checking it worked

```
curl -s -H "apikey: <your-publishable-key>" \
  https://<your-project-ref>.supabase.co/auth/v1/settings | grep google
```

`"google": true` means the provider is live. This is the same endpoint the
login page itself asks, so if it says `true`, the button is showing.

### What happens to someone who signs in with Google

They land on the same onboarding wizard an email signup does, with their
Google display name and profile picture already filled in, and no password
on the account. If they later want to sign in with a password instead, they
can set one through **Forgot password?** on the login page — the reset email
goes to the same address Google verified.
