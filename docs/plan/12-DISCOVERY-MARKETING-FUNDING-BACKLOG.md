# Discovery expansion — Marketing, Customer Acquisition and Funding backlog

The story list from the Discovery expansion specification
([`12-DISCOVERY-EXPANSION-SPEC.md`](./12-DISCOVERY-EXPANSION-SPEC.md), §54–§57), in the
table form `npm run build:progress` reads. The spec is the contract; this file records the
stories and the decisions taken while building them.

## Decisions and deviations

- **No new module keys.** Marketing and Funding are gated by the existing `discovery`
  licence (spec §3.1). New tables use `tenant AND licensed` RLS; Funding reads also need
  `funding.view` because a round's terms and diligence answers are sensitive.
- **Customer Acquisition is a navigation adapter** (`packages/core/src/lib/discovery-nav.ts`)
  over the existing offering-scoped routes — nothing was moved or renamed (§0.1, §38).
  "Knowledge" points at the offering overview and "Pipeline" at the AI discovery run
  history, the nearest existing pages.
- **No duplicate masters** (§24.2, §29.2): investors are `core.parties` with a new
  `investor` role, contacts are `core.party_contacts`, files are `core.attachments`.
  `investor_contacts`, `marketing_channels` and `funding_metrics` were not created.
- **Share links** live under the existing public `/p/*` namespace (`/p/dr/<token>`) rather
  than a new reserved top-level slug; only a SHA-256 of the token is stored.
- **Uploads** go through server actions, so the body limit was raised to Vercel's 4.5 MB
  ceiling and the asset/data-room limits set to 4 MB.
- **Alerts** use the existing derived alert bell, not a new notification store.
- **INT-05 is deferred**: the spec forbids scheduled monitoring until an unattended-
  execution design exists (§57–§58).

## Navigation

| ID | Story | Size |
|---|---|---|
| `DISC-NAV-01` | Discovery sidebar hierarchy | M |
| `DISC-NAV-02` | Business Offering navigation | S |
| `DISC-NAV-03` | Customer Acquisition navigation adapter | S |
| `DISC-NAV-04` | Marketing navigation | S |
| `DISC-NAV-05` | Funding navigation | S |
| `DISC-NAV-06` | Responsive navigation | S |

## Marketing

| ID | Story | Size |
|---|---|---|
| `MKT-01` | Marketing domain foundation | M |
| `MKT-02` | Marketing database | M |
| `MKT-03` | Marketing Dashboard | M |
| `MKT-04` | Strategy | M |
| `MKT-05` | Campaigns | M |
| `MKT-06` | Campaign metrics | M |
| `MKT-07` | Attribution | M |
| `MKT-08` | Content Studio | M |
| `MKT-09` | Content AI | M |
| `MKT-10` | Content Calendar | S |
| `MKT-11` | Assets | S |
| `MKT-12` | Website & SEO | M |
| `MKT-13` | AI-search visibility | S |
| `MKT-14` | Marketing Analytics | M |
| `MKT-15` | Notifications | S |
| `MKT-16` | Marketing recommendations | S |

## Funding

| ID | Story | Size |
|---|---|---|
| `FND-01` | Funding domain foundation | M |
| `FND-02` | Funding database | M |
| `FND-03` | Funding Dashboard | M |
| `FND-04` | Funding Profile | M |
| `FND-05` | Investor Readiness | M |
| `FND-06` | Fundraising Rounds | M |
| `FND-07` | Investor Database | M |
| `FND-08` | Investor Research | M |
| `FND-09` | Investor Pipeline | M |
| `FND-10` | Investor Interactions | S |
| `FND-11` | Investor Outreach | M |
| `FND-12` | Data Room | L |
| `FND-13` | Due Diligence | M |
| `FND-14` | Funding Analytics | M |
| `FND-15` | Finance read integration | S |
| `FND-16` | Funding AI | M |
| `FND-17` | Funding notifications | S |

## Cross-domain

| ID | Story | Size |
|---|---|---|
| `INT-01` | Discovery data context | M |
| `INT-02` | Evidence model | S |
| `INT-03` | Recommendations | S |
| `INT-04` | Notification integration | S |
| `INT-05` | Scheduled intelligence | L |
