// GENERATED FILE -- do not edit by hand.
// Source: docs/user-guides/*.md. Regenerate with `npm run build:help`.
// The markdown is the thing to change; this module is only how the app reads it.

import type { HelpGuide } from "../types";

export const HELP_GUIDES: HelpGuide[] = [
  {
    "slug": "getting-started",
    "order": 0,
    "title": "Getting Started",
    "summary": "Everything from your first login to a working business: creating an account, setting up your first business, understanding how businesses and offerings differ, licensing the modules you need, and adding your team.",
    "sections": [
      {
        "id": "creating-an-account",
        "heading": "1. Creating an account",
        "body": "Go to **Sign up**. You'll need:\n\n- **Email** (required)\n- **Password** (required, minimum 8 characters)\n- **Name** (optional)\n\nOr use **Continue with Google** to skip the password step entirely. The\nGoogle button only appears if the deployment's Supabase project actually has\nGoogle sign-in switched on — see §11 if you operate the deployment and want\nto enable it.\n\nAfter signing up with email/password, check your inbox and confirm your\nemail address before you can log in — the signup page shows a \"check your\nemail\" screen as a reminder. If you signed up with Google, you're taken\nstraight into the onboarding wizard.\n\n**Forgot your password?** Use the \"Forgot password?\" link on the login page."
      },
      {
        "id": "onboarding-your-first-business",
        "heading": "2. Onboarding: your first business",
        "body": "New accounts land in a short onboarding wizard rather than a bare \"create\nbusiness\" form. You'll be asked for:\n\n1. A short **description of what your business sells or does**.\n2. Your **website URL** — WonderArk visits it and researches your business\n   automatically (products, positioning, audience) to save you re-typing\n   things you've already published.\n3. A short description of your **target audience**.\n\nWonderArk uses this to create your business, create your first offering, and\nrun an initial AI analysis (ideal customer profile, etc.) so your Discovery\ndashboard isn't empty on day one. You don't need to name your business\nyourself in this step — a name is derived from your description and can be\nchanged later."
      },
      {
        "id": "businesses-offerings-and-why-there-are-two-concepts",
        "heading": "3. Businesses, offerings, and why there are two concepts",
        "body": "This trips up new users, so it's worth explaining once:\n\n- A **business** is your one shared operational back office: one inventory,\n  one tax registration, one crew, one customer ledger — regardless of how\n  many things you sell.\n- A **business offering** (managed inside the Discovery module) is one\n  product or service line you market — its own ideal customer profile, its\n  own prospect list, its own AI usage. A single business can have several\n  offerings (e.g. a hardware store that also does installation), each with\n  its own Discovery pipeline, but they all still share the *same* Inventory\n  stock, the *same* GST/tax registrations, and the *same* CRM customer\n  records underneath.\n\nIn short: **offerings are \"what you sell,\"** and they sit *on top of* a\nsingle shared business. Inventory, Service, CRM, and Finance all operate\nat the business level; only Discovery operates per-offering."
      },
      {
        "id": "switching-between-businesses-and-modules",
        "heading": "4. Switching between businesses and modules",
        "body": "- The **business switcher** (top bar) lists every business on your account.\n  Pin the ones you use most so they float to the top; there's always a\n  \"+ Create New Business\" option at the bottom.\n- The **module selector** (sidebar) switches between a business's *licensed\n  modules* (Discovery / Inventory / Service / CRM / Finance). An\n  unlicensed module still shows in the list, greyed out with a lock icon —\n  clicking it explains that it isn't licensed yet rather than crashing. You\n  can also \"pin\" to one module to keep the sidebar focused on just that\n  module until you unpin it."
      },
      {
        "id": "licensing-a-module",
        "heading": "5. Licensing a module",
        "body": "Go to **Settings → Licenses**. For each of your businesses you'll see every\nmodule with a status:\n\n| Status | Meaning |\n|---|---|\n| Active | Fully usable |\n| Cancels *\\<date\\>* | You cancelled, but keep full access until the current billing cycle ends |\n| Grace · *N*d left | Past cancellation — read-only access only, counting down a 30-day window |\n| Expired / Cancelled | No access; your data is retained, never deleted |\n| Not licensed | Never activated |\n\nButtons let you **Activate** a module, **Cancel** an active one (a confirm\ndialog explains the grace period before you commit), **Reactivate** during\ngrace or after cancellation (this restores full access and replays anything\nthat was queued up while you were on hold), or **Undo cancellation** while\nit's still pending.\n\nCancelling a module **never deletes your data** — worst case you get a\n30-day read-only window, then the module is simply inaccessible until you\nreactivate."
      },
      {
        "id": "billing-and-ai-credits",
        "heading": "6. Billing and AI credits",
        "body": "**Settings → Billing** is account-wide (not per business):\n\n- Connect your own AI provider key (OpenAI, Anthropic, or Google Gemini) so\n  AI features run on your own account, or leave it on **App Internal AI** to\n  use WonderArk's shared credits instead — no key required, capped by your\n  plan's free-tier allowance.\n- **Buy AI credits** if you're on App Internal AI and need more headroom.\n- A pricing-tier comparison table for reference (Free is the only plan you\n  can actually purchase today).\n\n**Settings → Usage** shows your account-wide AI usage this month, remaining\ncredit balance, and a breakdown per business/offering (each Discovery\noffering has its own separate free-tier allowance, so there's no single\nblended percentage across your account)."
      },
      {
        "id": "team-permissions",
        "heading": "7. Team & permissions",
        "body": "**\\<business\\> → Admin → Team** is the one shared place — across every\nmodule — where you see:\n\n- Every member of the business and their role.\n- The eight built-in roles (**Owner, Admin, Inventory Manager, Procurement\n  Manager, Sales Manager, Accountant, Warehouse Operator, Viewer**) and,\n  for each one, exactly which permissions it grants, grouped by module.\n\nToday this page is **read-only** — it's where you check what a role can do,\nnot yet where you invite people or reassign roles (custom roles and\nin-app role assignment are on the roadmap). Note that only **Owner** and\n**Admin** can touch module-configuration screens like CRM's channel\nconnections or routing rules — operating roles like Sales Manager can work\nthe pipeline but not reconfigure integrations."
      },
      {
        "id": "api-keys",
        "heading": "8. API keys",
        "body": "**\\<business\\> → Admin → API Keys** manages keys for WonderArk's public REST\nAPI, which every licensed module exposes resources through. Generating and\nrevoking keys requires the `settings.manage` permission (Owner/Admin by\ndefault)."
      },
      {
        "id": "the-superadmin-platform-portal",
        "heading": "9. The Superadmin Platform Portal",
        "body": "If you operate a WonderArk deployment (rather than just using one), there is\na separate staff-only control plane at `/platform` — global branding, plans,\nfeature entitlements, usage limits, which modules exist at all, internal AI\nprovider keys, and so on. It's not a licensable module and ordinary business\nadmins never see it; it exists for whoever runs the WonderArk service\nitself."
      },
      {
        "id": "environment-variables-for-whoever-deploys-wonderark",
        "heading": "10. Environment variables (for whoever deploys WonderArk)",
        "body": "If you're standing up your own instance, `apps/web/.env.example` documents\nevery variable. Grouped by purpose:\n\n| Purpose | Variables |\n|---|---|\n| Supabase connection | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (server-only, never expose to the browser) |\n| Branding | `NEXT_PUBLIC_BRAND_NAME` (defaults to \"WonderArk\") |\n| Outbound email | `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `RESEND_WEBHOOK_SECRET` |\n| Inbound email | `EMAIL_INBOUND_WEBHOOK_SECRET` |\n| AI credit purchases | `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` — optional; leaving these unset just disables the \"buy credits\" flow |\n| BYOK key encryption | `API_KEY_ENCRYPTION_SECRET` — a 32-byte base64 secret; **never rotate this once customers have connected keys**, it makes every stored key permanently undecryptable |\n| Platform-wide AI fallback | `PLATFORM_AI_API_KEY` — optional; lets accounts without their own key still use AI features, against their normal usage caps. A key set on the superadmin portal's **AI Providers** page takes precedence over this variable, and needs no redeploy |\n| Scheduled jobs | `CRON_SECRET` — checked on the background event-drain endpoint |\n| Internal demo-data tool | `PLATFORM_ADMIN_EMAILS` — comma-separated allowlist for `/dashboard/admin` (distinct from the `/platform` superadmin portal) |\n| CRM channel webhooks | `CRM_META_APP_SECRET`, `CRM_META_WEBHOOK_VERIFY_TOKEN`, `CRM_WHATSAPP_APP_SECRET`, `CRM_WHATSAPP_WEBHOOK_VERIFY_TOKEN` — see the [CRM guide](./04-crm.md#connecting-a-channel-whatsapp--instagram--facebook) |\n| SEO | `NEXT_PUBLIC_SITE_URL` — optional, falls back to the current deployment URL |\n\nNone of this is needed by an ordinary business user signing up on an\nexisting WonderArk deployment — it's only relevant to whoever operates the\ndeployment itself."
      },
      {
        "id": "enabling-google-sign-in-for-whoever-deploys-wonderark",
        "heading": "11. Enabling Google sign-in (for whoever deploys WonderArk)",
        "body": "The application code for Google sign-in is already in place — the\n\"Continue with Google\" button, the OAuth redirect, and the\n`/auth/callback` handler that turns Google's response into a session. What\nit needs is credentials, and those are configured outside the codebase, in\ntwo places. Until they exist the button is hidden rather than shown and\nbroken, so enabling Google is a configuration change only: nothing to\ndeploy, nothing to rebuild.\n\n### Step 1 — Create OAuth credentials in Google Cloud\n\n1. Open the [Google Cloud Console](https://console.cloud.google.com/) and\n   select (or create) a project for this deployment.\n2. **APIs & Services → OAuth consent screen.** Choose **External** unless\n   every user will have an account in your own Google Workspace, then fill\n   in the app name, a support email, and your logo. Add the scopes\n   `.../auth/userinfo.email`, `.../auth/userinfo.profile` and `openid` —\n   these are the defaults and are all WonderArk asks for.\n   While the consent screen is in **Testing**, only the accounts you list\n   as test users can sign in; **Publish** it before go-live.\n3. **APIs & Services → Credentials → Create credentials → OAuth client ID.**\n   Application type: **Web application**.\n4. Under **Authorised JavaScript origins**, add the origins people will\n   actually load the app from — e.g. `https://your-domain.com` and, for\n   local work, `http://localhost:3000`.\n5. Under **Authorised redirect URIs**, add **one** URI, and it is Supabase's,\n   not your app's:\n\n   ```\n   https://<your-project-ref>.supabase.co/auth/v1/callback\n   ```\n\n   This is the single most common thing to get wrong. Google redirects to\n   Supabase, and Supabase then redirects to WonderArk's own\n   `/auth/callback` — so your own domain does not belong in this field. A\n   mismatch here shows up as `redirect_uri_mismatch` at sign-in time.\n6. Copy the **Client ID** and **Client secret**.\n\n### Step 2 — Turn the provider on in Supabase\n\n1. Open the Supabase dashboard for this deployment's project →\n   **Authentication → Providers → Google**.\n2. Toggle it **Enabled**, paste the Client ID and Client secret, and save.\n3. Still in Authentication, check **URL Configuration**:\n   - **Site URL** — your production origin (e.g. `https://your-domain.com`).\n   - **Redirect URLs** — add `https://your-domain.com/auth/callback`, plus\n     `http://localhost:3000/auth/callback` for local development and a\n     wildcard for preview deployments if you use them\n     (e.g. `https://*-your-team.vercel.app/auth/callback`).\n\n   WonderArk always asks Supabase to send people back to\n   `{origin}/auth/callback`, taking the origin from the request itself, so\n   the same build works in local dev, previews and production — but every\n   origin you want that to work from has to be on this allowlist.\n\nThat is the whole of it. Within five minutes (the button's cached view of\nthe project's settings) — or immediately on the next cold start — the\nGoogle button appears on both the login and signup pages.\n\n### Checking it worked\n\n```\ncurl -s -H \"apikey: <your-publishable-key>\" \\\n  https://<your-project-ref>.supabase.co/auth/v1/settings | grep google\n```\n\n`\"google\": true` means the provider is live. This is the same endpoint the\nlogin page itself asks, so if it says `true`, the button is showing.\n\n### What happens to someone who signs in with Google\n\nThey land on the same onboarding wizard an email signup does, with their\nGoogle display name and profile picture already filled in, and no password\non the account. If they later want to sign in with a password instead, they\ncan set one through **Forgot password?** on the login page — the reset email\ngoes to the same address Google verified."
      }
    ]
  },
  {
    "slug": "discovery",
    "order": 1,
    "title": "Discovery: Customer Acquisition",
    "summary": "Discovery helps you figure out who to sell to, find them, and hand qualified opportunities to your sales process.",
    "sections": [
      {
        "id": "before-you-start-business-offerings",
        "heading": "Before you start: business offerings",
        "body": "Discovery works **per offering** — each product or service line you market\ngets its own ideal customer profile, prospect list, and AI usage allowance.\nSet up your business's offerings first, from the **Business** page (linked\nfrom the Discovery sidebar):\n\n1. Enter your business name, website, and a short description.\n2. Click **Auto-populate offerings** (only enabled once a website is set) —\n   WonderArk crawls your site, extracts a business profile with a confidence\n   score per field, and proposes candidate offerings for you to review, edit,\n   merge, or activate. You can also add offerings manually, or bulk-import a\n   catalog from CSV/Excel/PDF."
      },
      {
        "id": "connecting-an-ai-provider",
        "heading": "Connecting an AI provider",
        "body": "Discovery's AI features (ICP generation, prospecting, scoring, research\nbriefs) need an AI provider. Go to **Settings → Billing → AI**:\n\n- Pick **OpenAI**, **Anthropic**, or **Google Gemini** and paste your API\n  key, or\n- Pick **App Internal AI** to use WonderArk's shared credits instead — no\n  key required.\n\nWonderArk tests the connection live before saving. Your key is encrypted at\nrest; only a fingerprint and connection status are ever shown back to you.\nIf you don't connect a key and the deployment has a platform-owned key\nconfigured, you'll automatically fall back to it (still counted against your\nown free-tier usage limits)."
      },
      {
        "id": "the-discovery-dashboard",
        "heading": "The Discovery Dashboard",
        "body": "Your GTM home for the business: KPI tiles (offerings, prospects, reply rate,\nAI credits used this month), a **Needs attention** checklist (add a website,\ncreate an offering, generate a profile, define an ICP, discover prospects —\nwhichever step you haven't done yet), a conversion funnel, and — once you\nhave more than one offering — a cross-offering table plus an \"Accounts\nacross offerings\" panel showing companies that show up under more than one\nof your offerings."
      },
      {
        "id": "working-an-offering",
        "heading": "Working an offering",
        "body": "Each offering has its own hub page with:\n\n- **Top Opportunity Gate** — one AI-recommended opportunity to act on right\n  now, with watch/dismiss/send-to-CRM actions.\n- **Offering setup & sources** — website/description, knowledge-source\n  uploads, and a **Generate profile** action. Expanded by default until a\n  profile exists.\n- **Discovery Pipeline** — rediscovery schedule, saved discovery criteria,\n  and a **Run AI Discovery** panel with live progress.\n\n### ICP & Buyer Personas\n\nGenerate (or regenerate, clone, or approve) an Ideal Customer Profile:\nindustries, company sizes, geographies, roles, pain points, buying signals,\nexclusions, revenue range, business model, tech stack, growth stage, and\nexisting tools. Each field shows an AI confidence percentage and supporting\nevidence. Saving a new version re-runs anything downstream that depends on\nit (prospecting, scoring). Buyer Personas are managed on the same page,\nindependently of whether an ICP exists yet.\n\n### Finding prospects\n\n- **Discover** runs an AI web search against your approved ICP (with\n  optional overrides for industry, size, location, or keywords) and returns\n  suggestion cards — each with a match reason and source link — for you to\n  review before approving into your pipeline.\n- **Import** lets you bulk-load a prospect list from a CSV or other file.\n\n### Opportunity Intelligence\n\nEach prospect that clears your bar becomes a scored opportunity, with:\n\n- **Signals** — buying-signal events and a correlation record explaining the\n  opportunity's signal-strength score.\n- **Research** and a synthesized **Research Brief**.\n- **Buyer Intelligence** — per-contact seniority/relevance/contactability\n  scoring, computing a \"primary contact\" for you automatically.\n- **Score history** — recent scoring snapshots over time.\n- A **Recommended Action** (research more, find a better contact, draft a\n  message, send to CRM, watch, wait, or dismiss) — AI-suggested, always\n  user-overridable.\n\n### Handing off to CRM\n\nFrom a prospect or opportunity, **Send to CRM** hands the lead to the CRM\nmodule (if licensed) — WonderArk checks first whether this contact already\nexists there, so you see \"Already in CRM\" instead of creating a duplicate.\nIf CRM isn't licensed, this option simply isn't shown; nothing breaks.\n\n### Conversions\n\nTracks your funnel from prospect to won customer, and — if the Service (FSM)\nmodule is licensed — shows each won customer's field-service handoff status."
      },
      {
        "id": "licensing",
        "heading": "Licensing",
        "body": "Discovery is licensed like every other module, from **Settings → Licenses**\n— no Discovery-specific activation step beyond that."
      }
    ]
  },
  {
    "slug": "inventory",
    "order": 2,
    "title": "Inventory: Catalog, Purchasing & Stock",
    "summary": "Inventory manages your product catalog, warehouses, purchasing, sales orders, and stock levels — one shared inventory per business, regardless of how many Discovery offerings sit on top of it.",
    "sections": [
      {
        "id": "setup-order",
        "heading": "Setup order",
        "body": "Set these up in this order — each later step references the ones before it:\n\n1. **Warehouses** — create at least one location. Products, stock levels,\n   purchase orders, sales orders, and transfers all reference a warehouse.\n2. **Suppliers** and **Customers** — simple master-data lists. Set these up\n   before creating purchase orders (suppliers) or sales orders (customers).\n3. **Products** — create one by one, or bulk-import via **Products →\n   Import**. The CSV needs a header row with `sku` and `name` at minimum;\n   optional columns include `brand`, `category`, `supplier`, `unit`,\n   `hsn_code`, `tax_rate`, `cost_price`, `selling_price`, `reorder_point`,\n   `reorder_quantity`, `barcode`, `description`. The `supplier` column is\n   matched by name against suppliers you've already created — set those up\n   first if you're importing with supplier links. Note: this imports product\n   *masters*, not opening stock balances — bring in your starting stock\n   quantities via a purchase-order receipt or a manual stock movement (see\n   below).\n\nThere's no separate \"settings\" screen for units of measure or numbering —\npurchase order numbers auto-generate, units default to \"pcs\", and default\ntax rates come from your business's Finance (GST) profile."
      },
      {
        "id": "day-to-day-workflows",
        "heading": "Day-to-day workflows",
        "body": "- **Products** — catalog grid with category/supplier filters. Cost fields\n  are only visible to users with cost-viewing permission; editing likewise\n  requires an edit permission. Create, update, toggle active/inactive, and\n  generate barcodes here.\n- **Purchase Orders** — create a PO, approve it, and receive stock against\n  it line by line (partial receipts are fine — receive what's arrived, and\n  come back for the rest later). Tax amounts on each line calculate\n  automatically from your business's tax profile and the supplier's\n  location/registration — you never enter them by hand. **Receiving a line\n  is the moment stock actually increases.**\n  - Suppliers stage this feed and the Discovery→CRM handoff described in\n    the CRM guide will draw on the same supplier/customer records.\n- **Sales Orders** — create, confirm, ship, or cancel. Shipping a sales\n  order is the outbound counterpart to receiving a PO: it's what reduces\n  on-hand stock.\n- **Inventory (Stock)** — a live per-warehouse stock table, with a manual\n  stock-movement action for corrections or physical counts outside the\n  normal PO/SO flow.\n- **Stock Transfers** — move stock between two warehouses with a full\n  create → approve → ship → receive workflow, so you get an in-transit\n  audit trail (stock leaves warehouse A on ship, lands in warehouse B on\n  receive) rather than teleporting instantly.\n- **Sales Returns** — create a return against a shipped/delivered sales\n  order, then **approve** it. Approval — not creation — is the moment stock\n  is actually restocked (or written off as damaged) and a credit note is\n  issued against the original invoice.\n- **Alerts** — low-stock notifications, also surfaced in the shared topbar\n  bell across the whole platform.\n- **Audit Log** — a history of changes for accountability.\n- **Dashboard** — a summary view, filterable by warehouse."
      },
      {
        "id": "team-permissions",
        "heading": "Team & permissions",
        "body": "Inventory no longer has its own Team page — access is configured for the\nwhole business at **Admin → Team**, alongside every other module. Three of\nthe eight built-in roles are inventory-specific: **Inventory Manager**,\n**Procurement Manager**, and **Warehouse Operator** — check that page to see\nexactly which of the workflows above each one can perform (e.g. who can\napprove a PO vs. just receive stock against one)."
      },
      {
        "id": "how-this-connects-to-other-modules",
        "heading": "How this connects to other modules",
        "body": "- **Service (FSM)**: field jobs reserve parts from Inventory when scheduled,\n  consume them on job completion, and release the reservation if a job is\n  cancelled. This is entirely optional — jobs work fine without Inventory\n  licensed, they just skip material tracking.\n- **CRM**: an opportunity can turn into a real sales order (a \"fulfillment\n  request\") without leaving the CRM screen; CRM can also poll that order's\n  status and suggest in-stock substitutes when something's unavailable. A\n  customer's Inventory order history shows up on their CRM \"Customer 360\"\n  profile.\n- Cost data is never exposed to the platform's AI assistant, regardless of\n  the asking user's own permissions."
      }
    ]
  },
  {
    "slug": "service-fsm",
    "order": 3,
    "title": "Service: Field Service Management",
    "summary": "Service (module key fsm, so you may still see \"FSM\" in a few older places) runs your field-service business: turning a lead into a scheduled job, a completed visit, and an invoice — with crew dispatch and inventory parts-tracking built in.",
    "sections": [
      {
        "id": "setup-before-you-start",
        "heading": "Setup before you start",
        "body": "All under **Service → Settings**:\n\n- **Service Types** — the categories your jobs and opportunities are tagged\n  with (e.g. \"Repair,\" \"Installation\"). Only active ones show up when\n  creating a job or opportunity.\n- **Job Charge Types** — categories used for invoice and estimate line\n  items.\n- **Service Settings** — a single settings form covering:\n  - Reminder lead time and arrival-window length (for scheduling\n    communications)\n  - Whether to **auto-generate an invoice** the moment a job is marked\n    complete\n  - Default terms and estimate expiry (in days)\n  - Whether the **customer self-service portal** and **contact form** are\n    enabled\n- **Numbering** — a read-only view of your job/invoice number sequences.\n\n**Crew and technicians** are set up from the **Schedule** page, not\nSettings: toggle which business members are technicians there. A user who\nisn't set up as a technician sees a friendly message on **My Day** telling\nthem an owner/admin needs to add them first. There's no separate\nservice-area/zone concept in this module today."
      },
      {
        "id": "the-opportunity-job-invoice-lifecycle",
        "heading": "The opportunity → job → invoice lifecycle",
        "body": "1. **Opportunity** — capture a lead (new or existing customer), assign a\n   service type, and write up the scope of work.\n2. **Estimate** — build a quote with charge lines and send it to the\n   customer (they get a link to approve or decline it themselves, or your\n   staff can record the decision internally).\n3. **Job** — approving an estimate creates the job automatically, with a\n   generated job number. Re-approving an already-approved estimate won't\n   create a duplicate job.\n4. **Invoice** — generate an invoice from a completed job (or let it\n   auto-generate, if you turned that setting on). Send it, record payments,\n   mark paid/void, and reorder line items. If Finance is licensed, an\n   e-invoice/e-way-bill panel appears here too.\n\n### Working a job\n\nThe job detail page is the busiest screen in the module. From here you can:\nmark it scheduled, start it, put it on hold and resume, complete it, cancel\nit, reopen it, duplicate it, or convert it back to an opportunity (only\nbefore it's invoiced). You can also clock time in and out, log expenses and\nnotes, attach files, capture a customer signature, message the customer\nin-app, and grant \"customer center\" self-service access.\n\n**Completing a job** asks for an outcome from a fixed list: completed\nsuccessfully, completed with a recommendation, additional work required,\nparts required later, customer declined additional work, **warranty revisit\nrequired**, or unresolved. Choosing \"warranty revisit required\" automatically\ncreates a follow-up job linked back to the original — both jobs show a link\nto each other.\n\n### Scheduling and dispatch\n\n- **Schedule** — a day/week dispatch calendar per technician. Create,\n  reschedule, reassign, cancel, or delete events, and print work orders. If\n  Inventory is licensed, a **low-stock banner** appears here so dispatchers\n  see supply problems before they send a crew out.\n- **My Day** — the technician's own mobile agenda for today: mark \"on the\n  way,\" \"arrived,\" or \"done\" on each event, and clock in/out."
      },
      {
        "id": "parts-reservation-if-inventory-is-licensed",
        "heading": "Parts reservation (if Inventory is licensed)",
        "body": "This runs automatically and is entirely optional — if Inventory isn't\nlicensed, jobs just work as plain charges with no material tracking:\n\n- Scheduling a job **reserves** the parts it needs from your first active\n  warehouse. Anything that can't be reserved shows up as a shortfall you can\n  resolve (wait for restock, substitute an item, reschedule, or source it\n  manually) and retry later.\n- Completing a job **consumes** the reserved parts — unless a technician has\n  already filed an explicit actual-usage report (actual used / returned /\n  wasted), in which case that report is what moves stock, correctly\n  accounting for any prior partial reports.\n- Cancelling a job **releases** any reservation back to available stock."
      },
      {
        "id": "how-this-connects-to-other-modules",
        "heading": "How this connects to other modules",
        "body": "- **CRM**: a Service opportunity can originate from a CRM opportunity, and\n  the resulting job links back to it — useful for seeing the full lifecycle\n  from first contact to a completed on-site visit.\n- **Inventory**: parts reservation/consumption, described above.\n- **Finance**: invoices show e-invoice/e-way-bill status when relevant, and\n  every issued invoice posts to the ledger automatically.\n\nService is meant to sit downstream of CRM and alongside Inventory and\nFinance, but every one of those integrations is optional — the module\nworks completely standalone if you only license Service."
      }
    ]
  },
  {
    "slug": "crm",
    "order": 4,
    "title": "CRM: Leads, Conversations & Reputation",
    "summary": "CRM runs your pipeline from first message to won customer: a unified inbox across WhatsApp/Instagram/Facebook/Google, leads, opportunities, a lost-business recovery queue, and a full customer profile that pulls in data from every other licensed module.",
    "sections": [
      {
        "id": "navigation",
        "heading": "Navigation",
        "body": "**Overview**: Dashboard, Inbox, Conversations, Potential Lost Business,\nReviews, Analytics, Reactivation\n**Sales**: Leads, Sales Opportunities, Follow-ups, Exceptions\n**Administration**: Channels, WhatsApp, Routing Rules\n\n> **Inbox vs. Conversations**: you'll notice two inbox-shaped screens.\n> **Inbox** is an older, ticket-based model being phased out; **Conversations**\n> is the current unified-inbox experience described below. Use Conversations\n> day to day."
      },
      {
        "id": "daily-workflows",
        "heading": "Daily workflows",
        "body": "- **Dashboard** — a read-only launchpad. \"Potential Lost Business\" tiles\n  (unanswered messages, unanswered social questions, reviews needing\n  action, overdue leads, stale opportunities, open high-intent\n  conversations) link straight to the relevant working screen; a second\n  section covers pipeline metrics (new leads, open opportunities, pipeline\n  and won value, response SLA).\n- **Conversations** — filters (Needs response / Assigned to me / Overdue /\n  High intent, plus channel/status/owner dropdowns) next to a three-column\n  inbox (collapses to one column on mobile). Opening a conversation shows\n  linked lead/opportunity, an on-demand AI summary, products the customer's\n  interested in (with live stock and a waitlist option), the full message\n  timeline with delivery status, and one-click **Create Lead / Create\n  Opportunity / Create Task** on high-intent messages. Replying to WhatsApp\n  uses a free-form composer with an AI-suggested draft while you're inside\n  Meta's 24-hour service window, and switches to pre-approved templates once\n  that window closes — a Meta platform rule, not something WonderArk can\n  turn off. Instagram comment replies must happen inside Instagram itself;\n  WonderArk shows a reminder banner rather than a broken reply box.\n- **Leads** — a list with inline status editing (10 stages from new through\n  won/lost/disqualified) and inline owner reassignment, both directly in the\n  row.\n- **Sales Opportunities** — Kanban view by default (drag a card to change\n  its stage) or a List view (toggle in the page), which additionally lets\n  you edit deal value and reassign owner inline. Pipeline and won value\n  totals are shown as summary cards.\n- **Follow-up Queue** — one worklist across leads, opportunities, and\n  conversations that need action, with tabs for Due today / Overdue /\n  Upcoming / Unassigned / High priority, and an inline \"Complete\" button so\n  you never have to leave the list.\n- **Potential Lost Business** — every unanswered commercial message across\n  every channel, oldest (most urgent) first, with an AI-guessed intent you\n  can correct, and one-click actions: Respond, or Convert into a Lead /\n  Opportunity / Task, or dismiss as Not Relevant.\n- **Reviews** — connect your Google Business Profile location(s), sync\n  reviews on demand, and draft + publish AI-assisted responses (publishing\n  requires the review-publishing permission).\n- **Customer 360** (open from any contact) — one screen combining an AI\n  customer summary, a calculated Buying Intent score (0–100, with each\n  contributing signal and its evidence shown), contacts, relationship\n  timeline, open opportunities, follow-ups, products of interest, recent\n  conversations, notes, and outstanding balance. If licensed, it also pulls\n  in Discovery's prospect/signal data, Inventory's order history and\n  Finance's e-invoice status, and Service's job history — sections just\n  don't appear if that module isn't licensed for you."
      },
      {
        "id": "connecting-a-channel-whatsapp-instagram-facebook",
        "heading": "Connecting a channel (WhatsApp / Instagram / Facebook)",
        "body": "This is the one genuinely technical setup step in the platform, and it\nneeds both a WonderArk admin and whoever manages your Meta (Facebook)\ndeveloper account. WonderArk never creates the Meta App or completes its\nconsent screen for you — you bring your own Meta App, and WonderArk\nconnects to it.\n\n1. **Create (or reuse) a Meta App** at developers.facebook.com and add the\n   relevant product — \"WhatsApp\" for WhatsApp Business, or\n   \"Instagram\"/\"Messenger\" for Instagram DMs and Facebook Messenger.\n2. **Copy the App Secret** from the Meta App dashboard. Set it as an\n   environment variable on your WonderArk deployment: `CRM_WHATSAPP_APP_SECRET`\n   for WhatsApp, or `CRM_META_APP_SECRET` for Instagram/Messenger. WonderArk\n   uses this to verify every incoming webhook really came from Meta.\n3. **Invent a verify token** (any secret string of your choosing) and set it\n   in *two* places: WonderArk's `CRM_WHATSAPP_WEBHOOK_VERIFY_TOKEN` (or\n   `CRM_META_WEBHOOK_VERIFY_TOKEN`) environment variable, and the \"Verify\n   Token\" field when you configure the webhook in the Meta dashboard. Meta\n   uses this once to confirm you own the endpoint before sending real\n   traffic.\n4. **Point Meta's webhook at WonderArk.** In the Meta dashboard's Webhooks\n   section, set the callback URL to:\n   - `https://<your-domain>/api/webhooks/crm-whatsapp` for WhatsApp\n   - `https://<your-domain>/api/webhooks/crm-meta` for Instagram or Messenger\n     (both subscribe to this same URL)\n\n   Subscribe to the message-received field (and, for Instagram, \"comments\"\n   too, so comment replies can be recovered).\n5. **Set the environment variables before connecting anything** — the\n   webhook will reject incoming events with \"not configured\" until both the\n   app secret and verify token are set.\n6. **Back inside WonderArk**, go to **CRM → Channels** (or **CRM →\n   WhatsApp** for the WhatsApp-specific screen). Create a channel if you\n   don't have one, then under \"Connected accounts\" pick the provider and\n   paste in the Page ID / phone number ID / location ID and an access token\n   obtained from Meta's dashboard (or WhatsApp's Embedded Signup flow).\n   WonderArk verifies the token against the real Meta API immediately — a\n   bad token fails right away instead of silently breaking on your first\n   customer message. Choose an **instant-reply mode** per connected account:\n   off, AI drafts + human approves, or instant acknowledgement + human\n   follow-up.\n7. **WhatsApp templates**: register any templates you've already had\n   approved in Meta's dashboard (name, language, variable count) so the\n   reply composer can use them once the 24-hour free window closes.\n   WonderArk doesn't submit templates to Meta for you — only Meta's own\n   dashboard does that.\n8. **Google Business Profile (Reviews)** uses the same manual-paste pattern\n   but no webhook: enter an Account ID, Location ID, and access token, then\n   use **Sync now** to pull reviews on demand.\n9. **Monitoring**: WhatsApp connections show a live status badge\n   (connected / degraded / reauthorization required / disconnected /\n   provider error) with plain-language next steps, and are also rechecked\n   automatically on a schedule — you don't have to notice a problem\n   yourself."
      },
      {
        "id": "routing-rules-escalation",
        "heading": "Routing rules & escalation",
        "body": "**Routing Rules** currently configure the *structure* of how incoming\nmessages should be assigned by channel — the page says plainly that nothing\nyet applies these rules automatically to a live message; treat it as a\nstaging area, not a working automation, for now.\n\n**Escalation**, on the same page, is a fixed three-step ladder for\nunanswered commercial messages (reminder → owner escalation → manager\nescalation). The delay times are pre-set and not yet editable from the UI;\nthe one thing you configure here is **who the escalation manager is** — the\nperson unresolved messages ultimately land on."
      },
      {
        "id": "who-can-configure-what",
        "heading": "Who can configure what",
        "body": "CRM access is controlled by the shared **Admin → Team** page. Notably:\n**Owner** and **Admin** are the only roles that can manage channel\nconnections and routing/escalation settings. **Sales Manager** can work the\nfull day-to-day pipeline (leads, opportunities, follow-ups, messaging,\nreviews, analytics) but cannot touch channel or routing configuration."
      }
    ]
  },
  {
    "slug": "finance",
    "order": 5,
    "title": "Finance: Accounting, Banking & Tax",
    "summary": "Finance is your books: a real double-entry ledger that the rest of the platform posts into automatically, plus bank reconciliation, financial statements, and tax registration and filing preparation.",
    "sections": [
      {
        "id": "navigation",
        "heading": "Navigation",
        "body": "**Overview**: Dashboard\n**Accounting**: Chart of Accounts, Journal, Banking, Receivables, Payables,\nBills, Expenses, Financial Reports, Budget, Recurring Entries, Accounting\nPeriods\n**Tax & GST**: GST Profile, GST Registrations, GST Ledger, Filing Readiness,\nGST Filing, GSTR-2B Reconciliation, e-Invoicing, e-Way Bill\n**Records**: Evidence, Audit Log"
      },
      {
        "id": "first-run-set-up-your-chart-of-accounts",
        "heading": "First run: set up your chart of accounts",
        "body": "Nothing else in Finance works until there is somewhere for money to land.\nOpen **Chart of Accounts** and use **Set up standard accounts** — this\nprovisions a conventional chart (assets, liabilities, equity, income,\nexpenses) including the handful of *system accounts* the platform posts into\nby itself: Accounts Receivable, Accounts Payable, Bank, Sales, Output GST,\nInput GST, Inventory Asset, and Cost of Goods Sold.\n\nYou can add your own accounts alongside them, rename anything, and group\naccounts under parents to whatever depth you like. What you cannot do is\ndelete or deactivate a system account, because an automatic posting that\nsuddenly has nowhere to go would fail silently at exactly the moment nobody\nis looking."
      },
      {
        "id": "accounting-periods",
        "heading": "Accounting periods",
        "body": "Periods are how a set of books gets closed. Open **Accounting Periods**,\ngenerate the months (or quarters) for your financial year, and each one\nmoves through **open → closed → locked**:\n\n- **Open** — entries can be added, edited and reversed freely.\n- **Closed** — the normal end-of-month state. No new entries.\n- **Locked** — the period is filed. It is never reopened.\n\nCorrection is always by **reversal, never by edit**. Reversing an entry\nleaves both halves in the account's history, which is what an audit asks\nfor; quietly editing yesterday's number does not."
      },
      {
        "id": "the-journal-and-automatic-posting",
        "heading": "The journal and automatic posting",
        "body": "Most of what lands in your ledger you never type. When another module issues\na document — a Service invoice, an Inventory sales invoice, a supplier bill,\na credit note — or a payment is allocated against one, Finance posts the\nmatching journal entry by itself, using the account each role maps to.\n\n**Journal** shows every entry, automatic and manual, with its lines,\nits source document, and a **Reverse** action. To record something the\nplatform cannot know about (a director's loan, a depreciation charge, an\nopening balance), use **New entry** and enter the lines yourself. Debits\nmust equal credits before it will save.\n\n### When a document doesn't post\n\nTwo things are not retryable failures, so they are not treated as errors:\na document with no accounting consequence, and a chart of accounts that\nisn't set up yet. Both surface as **unposted documents** on the Finance\ndashboard instead, with the reason. Automatic posting that silently does\nnothing would be worse than none at all."
      },
      {
        "id": "banking",
        "heading": "Banking",
        "body": "**Banking** holds your bank and cash accounts, imported statements, and\nreconciliations.\n\n- **A bank account is not a ledger account.** One is where money physically\n  sits, the other is where it is recorded. Each bank account points at a\n  ledger account, so three current accounts can share one \"Bank\" line on the\n  balance sheet, or each have their own.\n- **Import a statement** from CSV. The importer reads the header row to find\n  your date, description and amount columns (including separate debit/credit\n  columns), and it never drops a row silently — anything it cannot read is\n  reported rather than skipped.\n- **Matching suggests, it never decides.** Candidate matches come back ranked\n  with the reason for each, and the amount is a gate: a wrong amount or the\n  wrong sign scores nothing at all. Finance only claims \"one clear match\"\n  when the best candidate is both confident *and* unrivalled. You confirm\n  every match.\n- **Reconcile** a statement period against the ledger. A reconciliation with\n  a known, explained difference still records — a gap someone has accepted is\n  a normal outcome, and refusing to save it just pushes the reconciliation\n  into a spreadsheet nobody can see. \"Reconciled\" needs agreement *and*\n  nothing left hanging."
      },
      {
        "id": "money-in-receivables",
        "heading": "Money in: Receivables",
        "body": "**Receivables** ages what customers owe you, by customer and by invoice, in\nthe usual buckets (current, 1–30, 31–60, 61–90, 90+). It reads the same\ninvoices and payment allocations the rest of the platform already holds, so\nthere is nothing to keep in sync."
      },
      {
        "id": "money-out-payables-bills-expenses",
        "heading": "Money out: Payables, Bills, Expenses",
        "body": "- **Bills** — enter a supplier bill by hand: supplier, bill date, due date,\n  line items, tax. Bills raised here are ordinary platform documents, so\n  payments, parties and allocations work on them exactly as they do on a\n  sales invoice. (A purchase order is deliberately *not* a payable — it\n  creates no liability and is routinely for a different amount than what\n  eventually gets billed.)\n- **Expenses** — a faster path for the small stuff: pick the expense\n  account, enter the amount, and optionally mark it paid on the spot, which\n  records the payment in the same step.\n- **Payables** — ages what you owe, by supplier and by bill, and is where you\n  **record a payment** covering several of one supplier's bills at once."
      },
      {
        "id": "financial-reports",
        "heading": "Financial Reports",
        "body": "**Financial Reports** produces, for any period you choose:\n\n- **Profit & Loss** — income and expenses, with the period's result.\n- **Balance Sheet** — assets, liabilities and equity. The period's profit\n  appears as its own equity line: until the year is closed, nothing has moved\n  trading results into retained earnings, and leaving that line out puts the\n  sheet out by exactly the profit. That is the classic \"my balance sheet\n  doesn't balance\", and it is a missing line rather than a broken ledger.\n- **Trial Balance** — every account's debit and credit totals, which should\n  agree."
      },
      {
        "id": "budget-and-recurring-entries",
        "heading": "Budget and Recurring Entries",
        "body": "- **Budget** — set a figure per account per period, then compare budget\n  against actual with the variance.\n- **Recurring Entries** — a journal template plus a schedule (monthly,\n  quarterly, and so on). Entries are generated on their due date; each one is\n  a normal journal entry you can review and reverse.\n\nNeither uses AI. Finance is deterministic arithmetic, and the platform's own\nengineering rules say not to put a language model where arithmetic belongs."
      },
      {
        "id": "tax-set-your-country-and-regime",
        "heading": "Tax: set your country and regime",
        "body": "A **country/regime bar** appears above every Finance tax page. Until you\nexplicitly set one, your business defaults to **India / GST** — this is a\ndefault, not a real setting, and shows a \"(default)\" tag until you save an\nexplicit choice.\n\nTo change it (requires edit permission): pick your country from the\ndropdown; if that country has more than one regime (e.g. the US has both\nSales Tax and 1099 Information Returns), a second dropdown appears. The\nselection saves and applies immediately across every tax page."
      },
      {
        "id": "tax-add-your-registration-s",
        "heading": "Tax: add your registration(s)",
        "body": "Go to **GST Registrations** — its title adapts to your regime (e.g. \"VAT\nregistrations,\" \"Sales Tax registrations,\" \"GST/HST registrations\"). Click\nto add a registration:\n\n- **India + GST**: enter your **GSTIN** (15 characters, uppercase, validated\n  against the standard format) and select a state jurisdiction.\n- **US or Canada**: enter your registration number (EIN/permit number, or\n  Canadian business number) and select a state/province jurisdiction.\n- **EU VAT countries**: enter your VAT number — there's no jurisdiction\n  field, since VAT registration is national, not regional.\n\nCheck **\"Set as primary\"** (checked by default) — the primary registration\nis the one every other document (invoices, e-way bills, tax splitting) uses.\nA registration's number and jurisdiction can't be edited after creation; to\nfix a mistake, cancel it and add a new one. From the registrations list you\ncan also Suspend, Reactivate, or Cancel a registration, and — for India/GST\nonly — edit additional profile details (registration type, return\nfrequency, e-invoice eligibility)."
      },
      {
        "id": "tax-day-to-day-workflows",
        "heading": "Tax: day-to-day workflows",
        "body": "- **GST Ledger** — your tax accounts in ledger form, reconciled against what\n  the return says. If the two disagree, that difference is the thing to look\n  at before filing.\n- **Filing Readiness** — one pre-flight check before you file, drawing on the\n  ledger, the sales and purchase registers, GSTR-2B, your bank\n  reconciliation and the period lock. It tells you what is not ready, not\n  just whether it is.\n- **GST Filing** — builds a purchase register and sales register for a chosen\n  month. This produces return-preparation output; it does **not** submit\n  anything to a tax authority on your behalf.\n- **GSTR-2B Reconciliation** — match your records against GSTR-2B/IMS-style\n  exceptions for a chosen month. **Sync exceptions** pulls the latest, then\n  **Resolve** or **Dismiss** each one. The input-tax-credit view shows what\n  is claimable and what is at risk.\n- **e-Invoicing** and **e-Way Bill** — see GSP credentials below; each has its\n  own screen to issue and cancel documents.\n- **Evidence** and **Audit Log** — supporting records and a change history for\n  accountability.\n\nA GST return covers the supplies of the **business**, not of whichever module\nraised the paperwork — Service invoices, Inventory invoices and bills entered\nby hand all count towards the same return."
      },
      {
        "id": "e-invoicing-e-way-bill-connecting-your-gsp-india-only",
        "heading": "e-Invoicing / e-Way Bill: connecting your GSP (India only)",
        "body": "If you file under India GST and need e-invoicing or e-way bills, you'll need\ncredentials from a **GST Suvidha Provider (GSP)** — the government-mandated\nintermediary these documents must be submitted through. Enter these once on\nthe **e-Invoicing** and **e-Way Bill** settings forms:\n\n- GSP provider name\n- Auth URL, Generate URL, Cancel URL (and optionally Status/Fetch URLs)\n- GSP username and password\n- Client ID and client secret\n\nYour GSP issues all of these when you sign up with them — WonderArk doesn't\nprovide a GSP relationship itself. Your password and client secret are\nencrypted at rest and only briefly decrypted at the moment WonderArk makes\nthe one outbound call to your GSP that needs them."
      },
      {
        "id": "working-without-the-other-modules",
        "heading": "Working without the other modules",
        "body": "Finance never hard-depends on Inventory or Service. If neither is licensed,\nyou enter bills and expenses by hand and the ledger works exactly the same;\nif they are, their documents post into it automatically. Turning one off\nlater stops new automatic postings — it does not remove what was already\nrecorded."
      },
      {
        "id": "legacy-links",
        "heading": "Legacy links",
        "body": "URLs under the old `/gst/...` and `/compliance/...` paths (e.g.\n`/your-business/gst/profile`) still work — they redirect automatically to the\nequivalent `/finance/...` URL. Update any bookmarks when convenient, but\nnothing breaks if you don't."
      },
      {
        "id": "a-note-on-regulatory-content",
        "heading": "A note on regulatory content",
        "body": "Finance ships with real, dated regulatory content for each supported\ncountry/regime, but tax rules change. Treat the built-in rates and rules as\na strong starting point, and verify against current regulations (or your\naccountant) before relying on this for an actual filing in production."
      }
    ]
  }
];
