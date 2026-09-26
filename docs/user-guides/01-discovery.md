# Discovery: Customer Acquisition, Marketing & Funding

Discovery is where a business finds its customers, markets to them and raises
money to grow. It has three working areas that share the same business,
offerings and data:

- **Customer Acquisition** — who to sell each offering to, finding them, and
  handing qualified opportunities to your sales process.
- **Marketing** — strategy, campaigns, content, assets, website & SEO and
  analytics.
- **Funding** — your funding profile, investor readiness, rounds, investors,
  outreach, data room and due diligence.

## How Discovery is organised

The Discovery sidebar is always the same shape:

| Item | What it is |
|---|---|
| **Overview** | The Discovery dashboard (below) |
| **Business** | Your business profile and its offerings |
| **Business Offerings** | One entry per offering you've created |
| **Marketing** | Dashboard, Strategy, Campaigns, Content, Assets, Website & SEO, Analytics |
| **Customer Acquisition** | Products, ICP, Prospects, Research, Signals, Outreach, Pipeline, Conversion, Knowledge — for one offering at a time |
| **Funding** | Dashboard, Funding Profile, Investor Readiness, Fundraising, Investors, Investor Outreach, Data Room, Due Diligence, Analytics |

**Switching offering.** When a business has more than one offering, the
header of every offering page has an **Offering** selector. Switching keeps
you on the same section — from ICP to the other offering's ICP, from
Prospects to its Prospects. The sidebar also remembers the offering you last
worked in, so going to Marketing and back to Customer Acquisition returns to
it rather than to the first offering.

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

### Conversions and handing off to Service

Tracks your funnel from prospect to won customer. If the Service module is
licensed, a won customer can be handed straight to field service: **create a
service opportunity** from the conversion, and its status (quoted, job
scheduled, completed, invoiced) shows back here. If Service isn't licensed,
the option isn't shown.

## Marketing

Marketing works across the whole business, not per offering, and uses the
same customers, offerings and prospects as the rest of Discovery.

- **Dashboard** — campaign performance, content in flight, and a list of
  what needs attention (content awaiting approval, campaigns ending soon,
  metrics to update).
- **Strategy** — your positioning, audiences, channels and goals. Saving
  keeps a version history.
- **Campaigns** — plan a campaign with its channels, budget and dates, track
  its metrics, and see which prospects and customers it influenced.
- **Content** — write posts, emails and pages, or ask the AI to draft them
  from your strategy and offering. Content moves **Idea → Draft → In review →
  Approved → Scheduled / Published**. Approving and publishing need the
  `marketing.approve` permission, and editing approved content sends it back
  to Draft so what goes out is always what was approved. A **calendar** view
  shows what's scheduled when.
- **Assets** — upload images and files to reuse in campaigns and content.
- **Website & SEO** — track pages, keywords and how visible you are in
  search and AI-search answers.
- **Analytics** — channel and campaign figures in one place. Import metrics
  from a CSV export of your ad or analytics tools; rows that can't be read
  are listed rather than silently dropped.

Nothing is ever published or sent automatically: AI drafts, a person
approves.

## Funding

Funding helps you get ready for and run a raise.

- **Dashboard** — your round's progress, the investor pipeline and what
  needs attention next.
- **Funding Profile** — the company story investors ask for: stage, traction,
  team, use of funds. If Finance is licensed, key figures (revenue, burn,
  cash) are read from your books; otherwise you enter them.
- **Investor Readiness** — a checklist score across the areas investors
  check, with what's missing.
- **Fundraising** — create a round (target, instrument, dates) and move it
  through its stages.
- **Investors** — your investor list, with research on each. Investors move
  through the pipeline **Identified → Researched → Target → Contacted →
  Meeting → Partner review → Due diligence → Term discussion → Committed →
  Invested** (or **Passed**). Forward moves can skip stages; amounts are
  required once an investor commits.
- **Investor Outreach** — draft outreach (the AI can help) and log replies.
  Outreach can only be sent once it's approved.
- **Data Room** — upload documents (pitch deck, financials, legal) by
  category; uploading a new version keeps the old one. Share with an investor
  through a link that expires and can be revoked at any time. Uploading needs
  `funding.data_room.manage`; sharing needs `funding.data_room.share`.
- **Due Diligence** — track each investor's diligence requests from asked to
  answered.
- **Analytics** — conversion through the pipeline and how the round is
  tracking.

## Who can do what

| Permission | Allows |
|---|---|
| `discovery.view` | Open Discovery and read everything in it |
| `discovery.manage` | Create and edit offerings, prospects, research and outreach |
| `marketing.manage` / `marketing.approve` | Work on marketing / approve and publish it |
| `funding.manage` / `funding.approve` | Work on funding / approve investor outreach |
| `funding.data_room.manage` / `funding.data_room.share` | Upload to / share the data room |
| `discovery.export`, `marketing.export`, `funding.export` | Export lists to CSV or Excel |

A **Viewer** can read all of Discovery but change nothing. See Getting
Started §7 for roles and invitations.

## Licensing

Discovery is licensed like every other module, from **Settings → Licenses**
— no Discovery-specific activation step beyond that.
