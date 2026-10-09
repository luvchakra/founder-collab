# Getting Started

Everything from your first login to a working business: creating an account,
setting up your first business, understanding how businesses and offerings
differ, licensing the modules you need, plans and billing, and adding your
team. The last four sections (§12 to §15) are for whoever operates the
deployment rather than for everyday users.

## 1. Creating an account

Go to **Sign up**. You'll need:

- **Email** (required)
- **Password** (required, minimum 8 characters)
- **Name** (optional)

Or use **Continue with Google**, **Continue with Microsoft** or **Continue
with LinkedIn** to skip the password step entirely. These buttons are on both
the sign-up and the login page, and each one only appears if that sign-in
method has been switched on for the deployment you're using — if you don't
see one, use your email and password. (§14 and §15 explain how whoever
operates the deployment switches them on.)

There is no separate sign-up step for these buttons: signing in with one for
the first time creates your account and takes you to your dashboard (§2); if
you came from an invitation, you're taken back to it instead (§8).

After signing up with email/password, check your inbox and confirm your
email address before you can log in — the signup page shows a "check your
email" screen as a reminder.

**Forgot your password?** Use the "Forgot password?" link on the login page.
If you signed in with Google, Microsoft or LinkedIn and would also like a
password, the same link lets you set one — the reset email goes to the email
address on your account.

**If a link or sign-in fails**, the page you land on says why (for example, a
password-reset link that has expired or was opened in a different browser
from the one that asked for it). Request a fresh link and open it in the
same browser.

## 2. Onboarding: your first business

New accounts go straight to the dashboard. Until you have a business it
shows a short prompt to create one: open the **business switcher** and choose
**+ Create New Business** (§4). You can name the business yourself, or give
its website and let WonderArk research it for you (products, positioning,
audience) so you don't re-type what you've already published. Either way the
name can be changed later, on the **Business** page.

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
- The **bell** (top bar) collects what needs you: plan and payment notices,
  background exports that are ready (or failed), AI allowance warnings once an
  offering has used 80% and 100% of its monthly allowance, offerings that
  still need a profile, prospects waiting for a next action, and each licensed
  module's own alerts (low stock, overdue invoices, open tickets, GSTIN
  problems). It shows the selected business's alerts by default, with
  an option to show all of them. Which ones you've read is remembered in this
  browser only.

## 5. Your dashboard

Signing in lands you on the **Executive Dashboard**. It is account-wide —
every business you belong to, whichever modules each has licensed — and it is
where you start your day:

- **Quick links** to Admin & settings, Licenses, Usage and Billing.
- **Overview** tiles for your businesses, offerings, prospects (with how many
  are qualified or new) and the AI credits used this month. Each tile links
  to where the detail lives.
- **Modules** — one card per module you have licensed, showing what needs you
  right now: open jobs (Service), low-stock alerts (Inventory), open tickets
  (CRM) and e-invoices this month (Finance). A card links straight through
  when exactly one of your businesses holds that module.
- **Conversions** — Discovery's prospect-to-customer funnel, win rate and fit
  scores, which you can slice by **Business**, **Offering** and **Industry**.
- **Needs attention** — a short to-do list: a module that is set to cancel
  (with **Undo**), a module in its read-only grace period (with
  **Reactivate**), and a Finance-licensed business that has no GSTIN yet.

**Download PDF** opens your browser's print dialog, so you can save the
dashboard as a PDF; the quick links and the button itself are left out of the
printout.

Each business also has its own landing page: opening a business takes you to
its Discovery dashboard.

## 6. Licensing a module

Open the avatar menu → **Admin** (or **Licenses** on the Executive Dashboard).
For each of your businesses you'll see every module with a status:

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

**Licenses and plans.** Licensing is tied to the business's plan (§7):

- Only people who can manage billing for the business (the Owner, plus anyone
  whose role grants `billing.subscription.change`) can activate, cancel or
  reactivate a module.
- Once online checkout is available, you can only switch a module on if your
  current plan includes it. Otherwise the page tells you to choose a plan
  that does, on the Billing page.
- A module that comes with your plan can't be cancelled from the Licenses
  screen — change or cancel the plan on the Billing page instead, so the two
  never disagree.
- Each module is licensed separately, so what a person sees also depends on
  their role (§8): a module that is licensed but not allowed by their role
  shows "you don't have permission", and a module the business hasn't
  licensed shows "not in your plan".

**Disabling a business.** In **Admin** (the business list), **Disable** hides
a business from the switcher and navigation without deleting anything;
**Re-enable** brings it back.

## 7. Plans, billing and AI credits

Each business has its own plan, which decides the modules it can use. Open
**\<business\> → Billing** (the **Billing** button on the **Business** page,
or **Manage plan** in the Plans list under avatar menu → Billing) to see the
current plan, its price, the modules it includes and your next billing date.
Everyone in the business can see the plan; changing it and seeing payments is
for people who hold `billing.subscription.change` (the Owner, plus anyone the
business grants it to). Everyone else is told to ask an owner or admin of the
account to change the plan.

The Billing page has three tabs — **Overview**, **Plans** and **Payment
history**.

- **Choosing a plan.** **Plans** ("Choose your plan") lists each plan with
  the modules it includes. Pick a plan and a monthly or yearly cycle, check
  the **Review your plan** summary (the price, the billing cycle, and that
  taxes, if any, are shown on the payment page), then pay through the secure
  checkout. Your licences update as soon as the payment is confirmed. The
  success page says "Subscription active" only once the payment has really
  been confirmed; until then it says "Payment received" and keeps checking,
  which usually takes a few seconds. If online payment isn't available for
  your business's currency yet, the Plans page tells you so.
- **If a payment doesn't go through,** nothing changes: you stay on your
  current plan, and the page says either "Checkout cancelled" (you left
  before paying; nothing was charged) or "Payment didn't go through" (you
  haven't been charged). Choose **Try again**, or use a different payment
  method.
- **Upgrading or downgrading.** On a paid plan, **Change plan** shows the
  current and new plan side by side and says when the change takes effect:
  straight away (with a prorated charge or credit, if that is how billing is
  set up) or on your next billing date, when you keep the current plan until
  then. Modules the new plan doesn't include become read-only for 30 days
  after the change takes effect; your data is kept.
- **Past-due payments.** If your latest payment couldn't be confirmed, a
  "Payment needs attention" banner appears. While payment is only past due,
  the subscription stays active; if further payments fail, the modules
  become read-only until you **Update payment method**.
- **Manage billing** and **View invoices** open the secure billing portal,
  where you update the payment method and see your invoices. **Payment
  history** lists every payment with its status (Pending, Paid, Failed,
  Refunded, Partly refunded, Disputed, Charged back). WonderArk never stores
  card details.
- **Cancel subscription** stops renewal. You keep full access until the end
  of the period you paid for, then the modules move to the 30-day read-only
  grace described in §6, and there are no further charges. Your data is never
  deleted. Until the period ends, **Keep my plan** undoes the cancellation, and
  subscribing again later restores everything.

**Avatar menu → Billing** (account-wide) is where AI is configured, and it
also lists each business's current plan with a **Manage plan** (or **Choose
a plan**) link:

- **AI.** Connect your own AI provider key — OpenAI, Anthropic or Google
  Gemini — so AI features run on your own provider account and bill straight
  to it, with no monthly cap from WonderArk. WonderArk tests the key before
  saving it and only ever shows back a fingerprint of it. Or choose
  **App Internal AI** to use WonderArk's included credits instead — no key
  needed. Switching providers is a matter of pasting a new key
  (**Replace key**); **Disconnect**, or choosing App Internal AI, goes back to
  the included credits.
- **Free monthly allowance.** On included credits, each workspace gets a
  modest free allowance every month (the card shows the current limits, in
  runs and in AI spend); whichever is reached first pauses AI features for
  that workspace until next month — unless you have bought credits.
- **AI credits.** Buy a credit pack — **Starter**, **Growth** or **Scale**;
  each card shows its price and how many AI runs it adds. Credits are spent
  automatically, one run at a time, only once a workspace has used up its
  free monthly allowance. They are shared across every business and offering
  on the account, and the page shows your **Remaining balance** and your
  **purchase history**. If you close the checkout window part-way through a
  payment, check the purchase history for its status before paying again.

**Avatar menu → Usage** shows your account-wide AI usage this month,
remaining credit balance, and a breakdown per business and offering; each
business's **Business** page also has an **AI usage** button. Repeated AI
requests are cached, so asking for the same research twice doesn't cost
twice.

## 8. Users, roles and invitations

**Users & access** — the chip on each business in avatar menu → **Admin**, or
on the **Business** page — is where you manage who can use a business and
what they can do. It has four tabs: **Users**, **Roles**, **Invitations** and
**Activity**. Everything here is per business: someone can be an Admin in one
business and a Viewer in another. (The older "Team" page now simply forwards
here.)

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

Roles are enforced by the platform itself, not just hidden in the menus:

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

## 9. API keys

**API keys** — the chip on each business in avatar menu → **Admin** — manages
keys for WonderArk's public REST API, which covers every licensed module's
resources. A key is shown once when it's created; revoke it here and it stops
working immediately. Generating and revoking keys requires the
`settings.manage` permission (Owner/Admin by default); without it the page
tells you that you don't have permission.

## 10. Exporting your data

Lists, reports and dashboards have an **Export** button in the page header.
Choose **CSV** or **Excel**:

- On a list, the file contains what you're looking at — the same filters,
  search and columns. Long lists also let you choose **Current filtered view**
  or **All matching records** before you pick the format.
- On a report or dashboard, **CSV** is the report's main table and **Excel**
  is the full workbook, with a sheet for each part of the report.

While a file is being prepared the button shows "Preparing…", so a double
click can't start two. Large exports run in the background: you'll see
"Export queued", and when the file is ready the **bell** shows "Export ready"
with a link to download it (or "Export failed", in which case nothing was
changed and you can simply try again). Background files are kept for about a
week and then removed. Exports respect permissions: each module has its own
export permission (for example `crm.export` or `finance.reports.export`), a
refusal tells you why (not licensed, no permission), and every export is
recorded in the audit log.

## 11. Your profile, your data and appearance

**Avatar menu → Profile** holds your personal details — name, photo, short
bio, phone, job title, location and time zone — visible only to you.

**Your data.** At the bottom of the Profile page, **Download my data** gives
you a copy of the personal data WonderArk holds about you as a person, as a
JSON file: your sign-in details (including which sign-in methods you use),
profile, account and business memberships, any employee records that name
you, and the actions recorded under your name (up to the 5,000 most recent).
Records you created *for a business* — its customers, invoices, prospects and
so on — belong to that business and are exported from within each module
(§10). To correct or delete your data, or to close your account, email
connect@wonderapps.biz from the address on your account; the Profile page and
the Privacy Policy ("your rights") say the same.

**Avatar menu → Appearance** switches between **Light**, **Dark** and
**System** (follows your device). The choice is saved on the device you set
it on.

## 12. The Superadmin Platform Portal

If you operate a WonderArk deployment (rather than just using one), there is
a separate staff-only control plane at `/platform` — global branding, plans
and prices, feature entitlements, usage limits, which modules exist at all
and feature flags, AI providers, routing, feature policies and usage, the
email provider, templates and notification policies, integrations,
compliance packs, platform policies, announcements, and subscription,
payment and billing-event records, and so on. It is protected by
multi-factor sign-in, and every change there is recorded in the platform
audit log and configuration history.

A superadmin can also switch off a single AI feature for everyone (for
example, AI outreach drafts) from **AI feature policies**, without turning
off the module or any other AI feature — each switch needs a reason and is
audited. It's not a licensable module and ordinary business admins never
see it; it exists for whoever runs the WonderArk service itself.

## 13. Environment variables (for whoever deploys WonderArk)

If you're standing up your own instance, `apps/web/.env.example` documents
every variable. Grouped by purpose:

| Purpose | Variables |
|---|---|
| Supabase connection | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (server-only, never expose to the browser) |
| Branding | `NEXT_PUBLIC_BRAND_NAME` (defaults to "WonderArk") |
| Outbound email | `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `RESEND_WEBHOOK_SECRET` |
| Inbound email | `EMAIL_INBOUND_WEBHOOK_SECRET` |
| AI credit purchases | `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` — optional; leaving these unset just disables the "buy credits" flow |
| BYOK key encryption | `API_KEY_ENCRYPTION_SECRET` — a 32-byte base64 secret; **never rotate this once customers have connected keys**, it makes every stored key permanently undecryptable. It also signs the unsubscribe links in outreach email (outreach won't send without it, and rotating it invalidates links already sent) |
| Platform-wide AI fallback | `PLATFORM_AI_API_KEY` — optional; lets accounts without their own key still use AI features, against their normal usage caps. A key set on the superadmin portal's **AI Providers** page takes precedence over this variable, and needs no redeploy |
| Scheduled jobs | `CRON_SECRET` — checked on the background event-drain endpoint |
| Internal demo-data tool | `PLATFORM_ADMIN_EMAILS` — comma-separated allowlist for `/dashboard/admin` (distinct from the `/platform` superadmin portal) |
| CRM channel webhooks | `CRM_META_APP_SECRET`, `CRM_META_WEBHOOK_VERIFY_TOKEN`, `CRM_WHATSAPP_APP_SECRET`, `CRM_WHATSAPP_WEBHOOK_VERIFY_TOKEN` — see the [CRM guide](./04-crm.md#connecting-a-channel-whatsapp--instagram--facebook) |
| SEO | `NEXT_PUBLIC_SITE_URL` — optional, falls back to the current deployment URL |

None of this is needed by an ordinary business user signing up on an
existing WonderArk deployment — it's only relevant to whoever operates the
deployment itself.

## 14. Enabling Google sign-in (for whoever deploys WonderArk)

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

They land on the same dashboard an email signup does, with their
Google display name and profile picture already filled in, and no password
on the account. If they later want to sign in with a password instead, they
can set one through **Forgot password?** on the login page — the reset email
goes to the same address Google verified.

## 15. Enabling Microsoft and LinkedIn sign-in (for whoever deploys WonderArk)

**Continue with Microsoft** and **Continue with LinkedIn** work exactly like
the Google button (§14): the code is already in place, each button is hidden
until its provider is switched on for the deployment, and turning one on is a
configuration change only — nothing to redeploy. Within about five minutes of
enabling a provider its button appears on both the login and the signup page.

For each provider you do the same two things as for Google:

1. **Register an app with the provider** (Microsoft's or LinkedIn's developer
   console) and copy its client ID and client secret. As with Google, the
   redirect URI you register is the *authentication service's* callback
   address for your project (the one described in §14), not your own domain.
2. **Turn the provider on** in the authentication service's Providers
   settings and paste in the ID and secret. Microsoft is listed there as
   **Azure (Microsoft)**; LinkedIn as **LinkedIn (OIDC)** — use the OIDC
   one. Check that your site's address and `/auth/callback` are on the
   service's redirect allowlist, exactly as in §14.

If someone clicks a button for a provider that isn't switched on (for example
while the setting is still propagating), they get a plain message saying that
sign-in isn't switched on for this deployment yet and to use email and
password or ask an administrator, rather than a technical error.

People who sign in with Microsoft or LinkedIn are treated like those who use
Google: a first sign-in creates the account and lands on the dashboard
(an invitee goes back to their invitation), and there is no password
on the account until they set one through **Forgot password?**.
