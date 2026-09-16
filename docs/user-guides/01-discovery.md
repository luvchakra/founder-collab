# Discovery: Customer Acquisition

Discovery helps you figure out who to sell to, find them, and hand qualified
opportunities to your sales process. Unlike the other modules, Discovery's
navigation isn't a fixed menu — it's built from your own business offerings,
so the sidebar always shows exactly the offerings you've created.

## Before you start: business offerings

Discovery works **per offering** — each product or service line you market
gets its own ideal customer profile, prospect list, and AI usage allowance.
Set up your business's offerings first, from the **Business** page (linked
from the Discovery sidebar):

1. Enter your business name, website, and a short description.
2. Click **Auto-populate offerings** (only enabled once a website is set) —
   WonderArk crawls your site, extracts a business profile with a confidence
   score per field, and proposes candidate offerings for you to review, edit,
   merge, or activate. You can also add offerings manually, or bulk-import a
   catalog from CSV/Excel/PDF.

## Connecting an AI provider

Discovery's AI features (ICP generation, prospecting, scoring, research
briefs) need an AI provider. Go to **Settings → Billing → AI**:

- Pick **OpenAI**, **Anthropic**, or **Google Gemini** and paste your API
  key, or
- Pick **App Internal AI** to use WonderArk's shared credits instead — no
  key required.

WonderArk tests the connection live before saving. Your key is encrypted at
rest; only a fingerprint and connection status are ever shown back to you.
If you don't connect a key and the deployment has a platform-owned key
configured, you'll automatically fall back to it (still counted against your
own free-tier usage limits).

## The Discovery Dashboard

Your GTM home for the business: KPI tiles (offerings, prospects, reply rate,
AI credits used this month), a **Needs attention** checklist (add a website,
create an offering, generate a profile, define an ICP, discover prospects —
whichever step you haven't done yet), a conversion funnel, and — once you
have more than one offering — a cross-offering table plus an "Accounts
across offerings" panel showing companies that show up under more than one
of your offerings.

## Working an offering

Each offering has its own hub page with:

- **Top Opportunity Gate** — one AI-recommended opportunity to act on right
  now, with watch/dismiss/send-to-CRM actions.
- **Offering setup & sources** — website/description, knowledge-source
  uploads, and a **Generate profile** action. Expanded by default until a
  profile exists.
- **Discovery Pipeline** — rediscovery schedule, saved discovery criteria,
  and a **Run AI Discovery** panel with live progress.

### ICP & Buyer Personas

Generate (or regenerate, clone, or approve) an Ideal Customer Profile:
industries, company sizes, geographies, roles, pain points, buying signals,
exclusions, revenue range, business model, tech stack, growth stage, and
existing tools. Each field shows an AI confidence percentage and supporting
evidence. Saving a new version re-runs anything downstream that depends on
it (prospecting, scoring). Buyer Personas are managed on the same page,
independently of whether an ICP exists yet.

### Finding prospects

- **Discover** runs an AI web search against your approved ICP (with
  optional overrides for industry, size, location, or keywords) and returns
  suggestion cards — each with a match reason and source link — for you to
  review before approving into your pipeline.
- **Import** lets you bulk-load a prospect list from a CSV or other file.

### Opportunity Intelligence

Each prospect that clears your bar becomes a scored opportunity, with:

- **Signals** — buying-signal events and a correlation record explaining the
  opportunity's signal-strength score.
- **Research** and a synthesized **Research Brief**.
- **Buyer Intelligence** — per-contact seniority/relevance/contactability
  scoring, computing a "primary contact" for you automatically.
- **Score history** — recent scoring snapshots over time.
- A **Recommended Action** (research more, find a better contact, draft a
  message, send to CRM, watch, wait, or dismiss) — AI-suggested, always
  user-overridable.

### Handing off to CRM

From a prospect or opportunity, **Send to CRM** hands the lead to the CRM
module (if licensed) — WonderArk checks first whether this contact already
exists there, so you see "Already in CRM" instead of creating a duplicate.
If CRM isn't licensed, this option simply isn't shown; nothing breaks.

### Conversions

Tracks your funnel from prospect to won customer, and — if the Service (FSM)
module is licensed — shows each won customer's field-service handoff status.

## Licensing

Discovery is licensed like every other module, from **Settings → Licenses**
— no Discovery-specific activation step beyond that.
