# WonderArc Discovery — Opportunity Intelligence Epic & Implementation Stories

## Purpose

Upgrade Discovery from an AI-assisted prospecting workflow into an **AI Customer Opportunity Intelligence Engine**.

The product should not compete with Apollo/ZoomInfo/Clay on database size. Its differentiation is:

> **Find the few companies most worth pursuing, explain why now, identify who to contact, show the evidence, recommend what to do, and learn from the outcome.**

## Product thesis

Discovery should answer:
1. Who should I talk to?
2. Why are they a fit?
3. Why now?
4. Who is the right person?
5. What should I do next?

Core flow:

```text
ICP / Goal
  → Find Accounts
  → Collect Signals
  → Correlate Signals
  → Opportunity Score
  → Why Now
  → Buying Committee
  → Research Brief
  → Recommended Action
  → Human Approval
  → CRM
  → Outcome
  → Feedback Loop
```

## Guardrails

- Do not build another prospect database.
- Evidence before inference. Never invent facts.
- Distinguish verified fact, inference, hypothesis and insufficient evidence.
- Signals are observations; opportunities are conclusions derived from relevant evidence.
- Human approval is mandatory before outbound communication.
- Continuous discovery must compress related signals into actionable opportunities rather than generate alert spam.
- Reuse the existing WonderArc monorepo, Discovery architecture, Supabase project, Core contracts, RLS, licensing, AI-run/audit mechanisms and UI system.
- Discovery owns prospects, research, signals, discovery opportunities, scoring and recommendations. CRM owns relationship lifecycle after handoff.
- No cross-module internal imports.

## Claude Code implementation protocol

Implement **one story at a time**.

For each story:
1. Inspect existing architecture/code first.
2. Reuse existing models/components/contracts where possible.
3. Implement only the requested story.
4. Add/update tests.
5. Run lint, typecheck, relevant tests and build.
6. Fix failures caused by the story.
7. Verify UI if applicable.
8. Commit the story.
9. Stop. Do not start the next story.

Commit format:
`feat(discovery): DISC-INTEL-01.x <description>`

---

# EPIC DISC-INTEL-01 — Opportunity Intelligence Engine

## Business outcome

Increase the percentage of discovered prospects that become meaningful conversations, qualified CRM opportunities and revenue.

Success means users prefer **"show me the 5 best opportunities today"** over **"give me 500 prospects."**

---

# P0 — Core Intelligence

## DISC-INTEL-01.1 — Discovery Opportunity Domain Model

### Objective
Introduce a Discovery-owned Opportunity entity without replacing existing prospect records.

### Requirements
Fields should include:
- opportunity_id
- workspace_id
- prospect/account reference
- status
- opportunity_score
- priority
- why_now_summary
- why_them_summary
- recommended_action
- confidence
- evidence_count
- created_at
- updated_at
- last_evaluated_at

Statuses:
`new`, `reviewing`, `watching`, `action_required`, `sent_to_crm`, `dismissed`, `expired`

### Acceptance criteria
- Existing prospects continue to work.
- Opportunity data is Discovery-owned.
- No CRM master data is duplicated.
- RLS protects workspace tenancy.
- Duplicate opportunities for the same prospect/trigger are prevented.

## DISC-INTEL-01.2 — Signal Normalization Layer

### Objective
Normalize signals from different providers into one internal contract.

### Signal fields
- signal_id
- workspace_id
- prospect/account reference
- signal_type
- source
- source_url where available
- observed_at
- published_at where available
- evidence_text
- confidence
- relevance
- raw/reference metadata
- expires_at where appropriate

Initial types:
`funding`, `hiring`, `leadership_change`, `job_change`, `technology_change`, `technology_adoption`, `technology_migration`, `product_launch`, `expansion`, `website_activity`, `social_activity`, `news`, `company_growth`, `pain_point`, `competitor_activity`, `review`, `customer_request`, `other`

### Acceptance criteria
- Providers map into the same internal representation.
- Source and dates are retained.
- Signals can become stale.
- Unsupported signals are never shown as facts.

## DISC-INTEL-01.3 — Signal Freshness and Confidence

### Objective
Prevent stale or weak information from being treated as current evidence.

### Requirements
Every signal has freshness, confidence, source and timestamp where available.

Freshness categories:
`Fresh`, `Recent`, `Aging`, `Stale`, `Unknown`.

Thresholds should be configurable by signal type.

### Acceptance criteria
- Stale signals are visibly marked.
- Scoring reduces weight for stale evidence.
- Missing dates produce `Unknown`, never fabricated dates.

## DISC-INTEL-01.4 — Multi-Signal Correlation Engine

### Objective
Move from isolated signal detection to opportunity reasoning.

Example:

```text
New CTO + hiring engineers + cloud migration
        ↓
Technology transformation opportunity
```

### Requirements
Identify related signals by account, relevance and time window and produce:
- correlated signal group
- rationale
- opportunity hypothesis
- confidence
- supporting evidence IDs

Prefer multiple independent signals. A single weak signal should not create a high-priority opportunity.

### Acceptance criteria
- Two or more related signals can be correlated.
- Every correlation links to source signals.
- AI explanations reference actual evidence.
- Duplicate correlated opportunities are suppressed.

## DISC-INTEL-01.5 — Discovery Opportunity Score

### Objective
Create a transparent prioritization score.

Initial dimensions:
- ICP Fit
- Buyer Fit
- Need / Problem Fit
- Timing / Why Now
- Signal Strength
- Contactability
- Evidence Confidence

### Acceptance criteria
- Score is explainable.
- Score components can be displayed.
- Missing data does not silently become a positive score.
- Low-confidence evidence lowers confidence.
- Weights are configurable for future experimentation.

## DISC-INTEL-01.6 — Why Now Engine

### Objective
Make timing a first-class Discovery output.

Output:
- why_now_summary
- timing_strength
- supporting_signals
- confidence
- last_verified

Example:
> New CTO plus simultaneous infrastructure hiring suggests an active technology transformation.

### Acceptance criteria
- Every Why Now statement has supporting evidence.
- Evidence has source/date where available.
- If no timing evidence exists, show `No strong timing signal detected`.
- Never invent urgency.

## DISC-INTEL-01.7 — Evidence-Backed AI Research

### Objective
Make AI research trustworthy.

Each important conclusion must retain:
- statement
- evidence
- source
- source date
- confidence
- evidence type

### Acceptance criteria
- No factual claim without evidence/reference.
- Unknown information is explicitly marked.
- Sources are traceable.
- Research can be regenerated.
- Existing Core AI run/audit tracking is reused.

## DISC-INTEL-01.8 — Prospect Research Brief

### Objective
Create a concise decision-oriented brief.

Sections:
- Company
- Why Them
- Why Now
- Who to Contact
- What They May Care About
- Relevant Signals
- Evidence
- Potential Objection
- Recommended Action
- Suggested Opening
- Confidence

Default view must be concise; evidence is expandable.

### Acceptance criteria
- Brief opens from an opportunity.
- Factual claims are evidence-backed.
- User can inspect evidence.
- User can initiate recommended action.
- User can hand off to CRM.

## DISC-INTEL-01.9 — Buying Committee / Person Intelligence

### Objective
Move from `Company → one contact` to a buying committee.

Roles may include:
`Economic Buyer`, `Decision Maker`, `Influencer`, `Champion`, `User`.

For each candidate contact show:
- name
- title
- seniority
- role classification
- contactability
- context
- why this person
- evidence

### Acceptance criteria
- Existing contact data is reused.
- AI does not invent people or roles.
- Role classification has confidence.
- Multiple contacts can be shown.
- User can select preferred contact for CRM/outreach.

## DISC-INTEL-01.10 — Signal-to-Action Recommendation

### Objective
Every meaningful opportunity should have a recommended next action.

Actions:
`Research`, `Contact`, `Draft Message`, `Send to CRM`, `Watch Account`, `Wait`, `Dismiss`, `Find Better Contact`.

### Acceptance criteria
- Every actionable opportunity has one primary action.
- User can override it.
- Recommendation is explainable.
- No outbound message is sent automatically.

---

# P0 — Discovery UX

## DISC-INTEL-01.11 — Today's Opportunities Dashboard

Create the primary Discovery command center.

Show:
- New
- Hot
- Needs Review
- Watching
- Insufficient Evidence

Each opportunity displays company, score, priority, Why Now, primary contact, recommended action and evidence count.

Actions:
`Research`, `Draft`, `Send to CRM`, `Watch`, `Dismiss`.

Acceptance criteria:
- Discovery-specific dashboard.
- Research Brief reachable in one action.
- CRM handoff available.
- No information overload.

## DISC-INTEL-01.12 — Responsive Opportunity Cards / Proto Table

Improve the existing prospect display.

- Mobile/tablet: useful card layout.
- Large screens: dense proto-table style.
- Treat each attribute independently.
- Show multiple attributes in a row where width permits.
- Prevent progress tags, badges and text from overlapping.
- Preserve the current light/blue visual language.

Acceptance criteria:
- Responsive at common widths.
- No overlapping UI.
- Important fields remain visible.
- Large screens support comparison.

## DISC-INTEL-01.13 — Opportunity Detail View

Sections:
`Opportunity Score`, `Why Now`, `Why Them`, `Who to Contact`, `Signals`, `Evidence`, `Research Brief`, `Recommended Action`, `History`, `Feedback`.

Acceptance criteria:
- All information links to underlying records.
- Primary action is obvious.
- Evidence is expandable.

---

# P1 — Continuous Discovery

## DISC-INTEL-01.14 — Saved Discovery Definition

Allow users to define what Discovery continuously looks for.

Definition contains:
- product
- ICP
- target market
- company attributes
- buyer roles
- desired signals
- excluded conditions
- minimum score
- monitoring frequency

Multiple definitions must be supported and enable/disableable.

## DISC-INTEL-01.15 — Account Watchlist

Allow users to monitor promising accounts without immediately contacting them.

Track:
- account
- reason for watch
- monitored signals
- last signal
- next review
- current score

Do not alert on every minor signal.

## DISC-INTEL-01.16 — Opportunity Alerts

Group related changes into meaningful alerts.

Example:
`Acme moved 61 → 89: new CTO + hiring + migration detected.`

Acceptance criteria:
- Related signals are grouped.
- Alerts contain reason/evidence.
- Duplicate alerts are suppressed.
- User controls preferences.

## DISC-INTEL-01.17 — Discovery Plays

Initial founder-friendly plays:
- Fast Growing Companies
- Recently Funded
- Hiring Relevant Roles
- New Executive
- Technology Migration
- Competitor Customers
- Multiple Buying Signals
- Unhappy Customers / Negative Reviews
- People Talking About the Problem
- Existing Customers Ready for Expansion

A play generates a modifiable Discovery Definition and explains what it is looking for.

---

# P1 — Negative Signals and Uncertainty

## DISC-INTEL-01.18 — Negative / Disqualifying Signals

Support:
- too small
- wrong geography
- wrong industry
- wrong technology/context
- no evidence of need
- existing CRM relationship
- recent rejection
- competitor lock-in
- insufficient evidence

Negative signals reduce score but are visible and overridable.

## DISC-INTEL-01.19 — Insufficient Evidence State

Create a first-class state:

```text
Opportunity Score: —
Confidence: Low
Status: Insufficient Evidence

Reason:
Not enough reliable evidence to determine timing.
```

Never fabricate a score or Why Now. Allow Watch and automatic reevaluation when new evidence appears.

---

# P1 — Feedback / Learning

## DISC-INTEL-01.20 — Prospect Feedback

Capture:
`Good Prospect`, `Bad Prospect`, `Wrong Person`, `Wrong Timing`, `Good Message`, `Bad Message`, `Interested`, `Not Interested`, `Already Customer`, `Not Relevant`, `Spam`.

Allow optional comments. Persist feedback against the opportunity/prospect.

## DISC-INTEL-01.21 — Discovery Learning Dataset

Capture:
- ICP attributes
- signals
- score
- recommendation
- user decision
- message
- response
- conversion
- feedback

Do not introduce autonomous model retraining in this story.

## DISC-INTEL-01.22 — Controlled Feedback-Driven Adjustment

Use configurable rules/weights initially rather than autonomous model retraining.

Example:
If users repeatedly reject prospects with signal X, reduce X's recommendation weight.

Changes must be measurable, reversible and audited.

---

# P1 — AI Cost / Provider Architecture

## DISC-INTEL-01.23 — Progressive Intelligence Pipeline

Use staged processing:

```text
Cheap filtering
  → enrichment/signals
  → scoring
  → deep research for top candidates
  → personalized message after user review
```

Deep research must not run against every raw prospect. Reuse existing Core AI run tracking and expose usage/cost metrics.

## DISC-INTEL-01.24 — AI Research Cache

Cache reusable research with:
- source
- timestamp
- expiry
- input/context hash
- provider/model
- research version

Reuse valid research; refresh expired data; allow manual refresh; respect tenancy.

## DISC-INTEL-01.25 — Provider-Agnostic Data Contracts

Define internal contracts for:
- company enrichment
- person enrichment
- signal retrieval
- technology detection
- news/social signals
- contact verification

Provider-specific code must not leak into domain/UI models.

---

# P1 — CRM Handoff

## DISC-INTEL-01.26 — Discovery → CRM Opportunity Handoff

Handoff context should reference:
- prospect
- company
- selected contact
- opportunity score
- Why Them
- Why Now
- supporting signals
- research brief
- recommended action
- discovery source

Discovery remains source of truth for discovery research; CRM becomes source of truth for relationship lifecycle.

Acceptance criteria:
- Explicit handoff.
- Duplicate CRM records avoided.
- Existing party/customer/lead matching performed.
- Handoff audited.
- Handoff status visible.

## DISC-INTEL-01.27 — Existing Customer / Relationship Detection

Resolve prospects against Core/CRM identity and classify:
`New Prospect`, `Existing Lead`, `Existing Customer`, `Existing Opportunity`, `Existing Contact`, `Potential Duplicate`.

Do not create duplicate relationship records.

## DISC-INTEL-01.28 — Discovery Opportunity Lifecycle

Track:
`Detected → Reviewed → Action Selected → CRM Handoff → Conversation Started → Qualified → Won/Lost/Nurture`.

CRM owns post-handoff lifecycle; Discovery retains references/outcomes for learning.

---

# P2 — Analytics

## DISC-INTEL-01.29 — Discovery Performance Dashboard

Metrics:
- prospects discovered
- opportunities detected
- high-confidence opportunities
- opportunities reviewed
- opportunities accepted
- CRM handoffs
- conversations started
- qualified opportunities
- won opportunities
- false-positive rate
- wrong-person rate
- wrong-timing rate
- average opportunity score
- score-to-conversation conversion
- signal-to-conversation conversion

Metrics must distinguish prospects from opportunities and use CRM outcomes where appropriate.

## DISC-INTEL-01.30 — Opportunity Quality Analysis

Measure:
`Score → User Acceptance → Conversation → Qualification → Conversion`.

The system should answer:
- Do higher-scoring opportunities convert better?
- Which signals correlate with successful conversations?
- Which signal combinations produce useful opportunities?
- Which recommendations are repeatedly rejected?

---

# Architecture and Security Requirements

## Ownership

### Discovery owns
- Prospects
- Research
- Signals
- Opportunity hypotheses
- Opportunity scores
- Discovery definitions
- Watchlists
- Discovery feedback
- Research briefs

### Core owns
- Tenancy
- Identity
- Parties
- Licensing
- RBAC
- AI runs
- Audit
- Domain events

### CRM owns
- Leads
- CRM opportunities
- Activities
- Conversations
- Follow-ups
- Relationship lifecycle

Do not duplicate masters unnecessarily.

## Cross-module communication

Allowed only through:
1. approved Core reads/contracts
2. another module's public contract
3. `core.domain_events`

No imports of another module's internals.

## Security

All new records must enforce existing:
- workspace/tenant isolation
- RLS
- module licensing
- authentication
- RBAC
- auditability

Outbound external actions remain human-approved.

---

# Failure Handling

### Provider unavailable
`Data provider temporarily unavailable.`

### No signals
`No meaningful buying signals detected.`

### Conflicting evidence
`Conflicting evidence detected.`

### Insufficient data
`Insufficient evidence to determine opportunity timing.`

### AI failure
Retain underlying data and allow retry.

### Duplicate opportunity
Reference/merge into existing opportunity rather than creating another.

### Stale evidence
Reduce confidence and show freshness clearly.

Never fabricate fallback data.

---

# UX Principles

1. **Action first** — show what the founder should do before showing all available research.
2. **Progressive disclosure** — summary → research brief → detailed evidence/raw signals.
3. **Visible confidence** — High / Medium / Low / Insufficient Evidence.
4. **No AI decoration for its own sake** — AI UI must provide decision value.
5. **Opportunity compression** — consolidate multiple signals into a small number of actionable opportunities.

Suggested navigation:

```text
Overview
  Dashboard

Products
  Product A
  Product B
  ...

Discovery
  Opportunities
  Prospects
  Signals
  Watchlist
  Discovery Plays
  Research

Insights
  Analytics
  Feedback
```

Preserve existing navigation/components where possible.

---

# Release Plan

## Release 1 — Core Intelligence

Implement:
`01.1, 01.2, 01.3, 01.4, 01.5, 01.6, 01.7, 01.8, 01.10, 01.11`

Outcome: existing prospects/signals become explainable opportunities.

## Release 2 — People + Continuous Discovery

Implement:
`01.9, 01.14, 01.15, 01.16, 01.17, 01.18, 01.19`

Outcome: Discovery continuously finds and prioritizes opportunities.

## Release 3 — Learning + Efficiency

Implement:
`01.20, 01.21, 01.22, 01.23, 01.24, 01.25`

Outcome: lower cost and progressively better recommendations.

## Release 4 — Revenue Handoff + Analytics

Implement:
`01.26, 01.27, 01.28, 01.29, 01.30`

Outcome: Discovery intelligence is connected to CRM and measurable revenue outcomes.

---

# Final Product North Star

> **I don't want 500 leads. I want to know the 5 companies I should talk to today, why they might need me now, who I should contact, what evidence supports that conclusion, and exactly what I should do next.**

Optimize Discovery for:

**High-confidence opportunities → meaningful conversations → CRM handoff → revenue.**

Do not optimize primarily for number of prospects, number of signals, amount of AI-generated text, number of filters, or database size.
