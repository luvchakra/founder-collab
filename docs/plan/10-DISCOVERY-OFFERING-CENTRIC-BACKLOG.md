# WonderArc Discovery — P0/P1 Offering-Centric Upgrade

> Implementation backlog for Claude Code.
> Scope: Discovery module only.
> Priority: P0 and P1.
> Development mode: **one story at a time**.

## 0. Product Decision

The primary unit of Discovery should move from:

**Business → Products → Prospects**

to:

**Business → Business Offerings → Offering ICP → Discovery → Signals → Opportunities → CRM**

A **Business Offering** is the commercial thing the business wants to sell or promote. It can be a product, service, subscription, consulting package, maintenance contract, training, solution, or other sellable offering.

Examples:

- Managed IAM Services
- IAM Consulting
- Corporate IAM Training
- AC Installation & Service
- Annual Maintenance Contract
- ERP Implementation
- Corporate Catering

### Core rule

> Every Discovery result must be evaluated in the context of a specific Business Offering.

One business can have multiple offerings. One account can be relevant to multiple offerings with different scores, signals, buying personas, timing, and messaging.

---

# 1. Product Goal

Discovery should answer:

1. What am I trying to sell?
2. Who is most likely to need it?
3. Which accounts are worth pursuing?
4. Why are they a fit?
5. Why now?
6. Who should I approach?
7. What evidence supports the conclusion?
8. What should I do next?

Discovery should optimize for:

**High-confidence opportunity → meaningful conversation → CRM handoff → revenue**

not:

**More prospects → more signals → more AI text**

---

# 2. Current-State Assumptions

This backlog is designed around the existing WonderArc/Founder-Collab Discovery direction already established:

- Discovery was ported from CoFounderAI.
- Discovery can define a business/product context.
- It can find matching companies and contacts.
- It performs AI research.
- It identifies buying signals.
- It supports outreach/recommendation workflows.
- Discovery is a standalone licensed module in the WonderArc monorepo.
- Discovery uses `workspace_id` tenancy.
- Core owns shared parties, identity, licensing, RBAC, AI runs, audit and domain events.
- CRM will own relationship lifecycle after handoff.

**Important:** Claude Code must inspect the actual current implementation before changing it. This document is the target-state backlog, not permission to rebuild the existing module from scratch.

---

# 3. Global UI Design Rule — ALWAYS APPLY

This is a **generic WonderArc design rule** and must be treated as a permanent instruction for Claude Code, not only for this epic.

Whenever implementing or modifying any page, card, table, form, list, row, dashboard, dialog, or other UI:

- Plan the layout professionally before coding. Do not simply place elements where they fit.
- Improve information hierarchy, spacing, alignment, grouping, whitespace and information density.
- Use subtle borders, dividers, containers and visual grouping where they improve clarity; do not add borders purely for decoration.
- Place buttons/actions deliberately and consistently. Primary, secondary, destructive and contextual actions must have clear hierarchy.
- Keep actions aligned with the item they operate on. Buttons must not float, overlap, wrap awkwardly or become visually disconnected from their target.
- Where an item/row supports editing, provide an obvious edit/action affordance such as inline edit, edit button, action menu or contextual control.
- Use responsive layouts based on available width.
- On desktop/large screens, prefer a table or table-like/proto-table when the user needs to compare multiple rows/attributes.
- On tablet, use an adaptive dense layout without unnecessary horizontal scrolling.
- On mobile, use cards or stacked rows with progressive disclosure.
- Where width permits, show multiple related attributes in one row instead of unnecessarily increasing vertical height.
- Avoid excessive pills, badges, nested cards, shadows and decorative elements.
- Prevent overlap, clipping, broken wrapping and poorly placed actions.
- Maintain consistent row height, typography, column alignment, icon usage and action placement.
- Test representative desktop, tablet and mobile widths.
- A screen is **not done** merely because it technically works. It must look intentional, polished, professional and usable.
- Reuse existing WonderArc design-system components rather than creating inconsistent one-off UI.
- Do not redesign unrelated modules unless explicitly required by the story.

### Required UI workflow

Before a substantial UI change:

1. Inspect the current page and reusable components.
2. Identify primary, secondary and optional information.
3. Identify all user actions and their hierarchy.
4. Choose desktop, tablet and mobile layouts.
5. Decide where borders/dividers/grouping/edit controls help.
6. Implement.
7. Test representative screen sizes.
8. Check overflow, overlap, wrapping, spacing, alignment and action placement.
9. Fix visual issues before completing the story.

### Definition of UI Done

> The page should look like a professionally designed production SaaS interface at every supported screen size, not merely function correctly.

---

# 4. Architecture Guardrails

Claude Code MUST preserve the locked architecture.

## Reuse

Reuse existing:

- Discovery schema/tables where possible
- Discovery server actions/contracts
- Core party/identity model
- Existing AI runs
- Existing audit
- Existing RLS
- Existing module registry/licensing
- Existing design system
- Existing data-provider integrations
- Existing prospect/company/contact data
- Existing research/signal records

## Do not

- create a second auth system
- create a second tenancy model
- create a second company/customer master
- turn Discovery into CRM
- import CRM/Inventory/FSM internals
- copy entire datasets between modules unnecessarily
- break existing Discovery functionality
- perform destructive migration of existing demo data

## Module ownership

### Discovery owns

- Business Offerings
- Offering ICP
- Discovery definitions
- Prospects/discovery results
- Signals
- Research
- Opportunity intelligence
- Discovery feedback

### Core owns

- Identity
- Tenancy
- Parties
- RBAC
- Licensing
- AI runs
- Audit
- Domain events

### CRM owns

- Leads
- Relationship lifecycle
- Conversations
- Activities
- Follow-ups
- CRM opportunities

Discovery should hand off to CRM rather than becoming a CRM.

---

# 5. P0 EPICS

## EPIC DISC-OFFER-P0-01 — Business Offering Foundation

### Story DISC-OFFER-P0-01.1 — Introduce Business Offering

**Goal:** Make Business Offering the primary commercial context for Discovery.

Fields should include at minimum:

- offering_id
- workspace/business context according to existing tenancy
- name
- short_description
- detailed_description
- category
- offering_type
- value_proposition
- primary_problem
- target_market
- status
- created_at
- updated_at

Offering types may include:

- Product
- Service
- Subscription
- Consulting
- Professional Service
- Maintenance
- Training
- Package
- Solution
- Other

**Acceptance criteria**

- A business can create multiple offerings.
- An offering belongs to the correct tenant/workspace.
- Offerings support active/inactive/archive.
- Existing Discovery records continue to work.
- No destructive migration.
- Offering is available through a stable Discovery contract.

---

### Story DISC-OFFER-P0-01.2 — Existing Product Compatibility

Map the existing Product concept to Business Offerings without breaking current data.

Preferred approach:

```text
Existing Product
     ↓
Offering compatibility/reference
     ↓
Offering-centric Discovery
```

**Acceptance criteria**

- Existing products remain viewable.
- Existing prospect/research/signal records remain accessible.
- New offering context can be associated incrementally.
- No destructive data migration.
- Existing workflows continue to work during transition.

---

### Story DISC-OFFER-P0-01.3 — Business Offering Create/Edit UI

Build a professional Offering management screen.

Required actions:

- Create
- Edit
- Activate/deactivate
- Archive
- Duplicate/clone

Desktop should use a clean table/proto-table for multiple offerings.

Suggested columns:

| Offering | Type | Target Market | Status | Active Discovery | Updated | Actions |

Use a mobile card/list layout at narrow widths.

**Acceptance criteria**

- Clear primary action.
- Row-level edit/action affordance.
- Responsive design.
- No overlapping controls.
- Long descriptions are truncated with a way to view full content.

---

# EPIC DISC-OFFER-P0-02 — Offering Setup & ICP

### Story DISC-OFFER-P0-02.1 — Offering Setup Wizard

Create a simple setup flow:

1. What do you sell?
2. What problem does it solve?
3. Who normally buys it?
4. Where do you sell it?
5. Why do customers choose it?
6. Optional commercial context.

Allow natural-language input.

Example:

> "We provide managed IAM services to mid-size financial companies."

AI can propose structured fields.

User must accept/edit suggestions before activation.

**Acceptance criteria**

- Manual entry works.
- AI suggestions are editable.
- AI does not silently save inferred information as fact.
- User can complete setup without AI.

---

### Story DISC-OFFER-P0-02.2 — Offering ICP Builder

Each offering gets its own ICP.

Support:

- industries
- company size
- revenue
- geography
- business model
- technology
- growth stage
- existing tools
- pain points
- buyer roles
- exclusions/disqualifiers

**Acceptance criteria**

- ICP is linked to the offering.
- One business can have different ICPs for different offerings.
- ICP can be cloned and edited independently.
- Discovery uses the selected offering ICP.

---

### Story DISC-OFFER-P0-02.3 — Offering Buyer Persona Definition

Define offering-specific buyer personas.

Example:

**IAM Consulting**

- CISO — executive buyer
- IAM Director — decision maker
- Security Architect — influencer

**IAM Training**

- Security Manager — buyer
- IAM Manager — decision maker
- L&D Manager — budget stakeholder

**Acceptance criteria**

- Personas belong to offering.
- Multiple personas are supported.
- Priority can be specified.
- User can edit persona definitions.
- Personas are available to research/scoring.

---

# EPIC DISC-OFFER-P0-03 — Offering-Centric Discovery Workspace

### Story DISC-OFFER-P0-03.1 — Offering Context Selector

The user must always know:

```text
Business: ABC Consulting
Offering: Managed IAM Services
```

The business/offering context should be available in the global Discovery header where appropriate.

**Acceptance criteria**

- Switching offering updates Discovery context.
- Results from another offering do not leak into current view.
- Context persists through relevant navigation.
- Desktop and mobile UX are both usable.

---

### Story DISC-OFFER-P0-03.2 — Offering Discovery Overview

Create the primary offering workspace.

Suggested sections:

```text
Offering Overview
ICP Health
Active Discovery Plays
Today's Opportunities
Recent Signals
Watchlist
CRM Handoffs
```

Avoid vanity metrics dominating the page.

Primary content:

> **What should I do today for this offering?**

---

### Story DISC-OFFER-P0-03.3 — Offering Navigation

Recommended structure:

```text
Overview
  Dashboard

Offering
  Overview
  ICP
  Discovery
  Opportunities
  Signals
  Watchlist
  Research

Insights
  Analytics
  Feedback
```

Do not create unnecessary nested navigation. Preserve the existing WonderArc shell.

---

# EPIC DISC-OFFER-P0-04 — Offering Discovery Strategy

### Story DISC-OFFER-P0-04.1 — Discovery Definition

A Discovery Definition must reference one offering.

Include:

- offering
- ICP
- target geographies
- target industries
- buyer roles
- desired signals
- excluded signals
- disqualifiers
- minimum score
- monitoring status/frequency

**Acceptance criteria**

- Multiple definitions per offering.
- Enable/disable.
- Every result can be traced to its definition.

---

### Story DISC-OFFER-P0-04.2 — Discovery Play

Provide founder-friendly strategy presets.

Initial plays:

- Recently Funded
- Rapid Growth
- Hiring Relevant Roles
- New Executive
- Technology Migration
- Competitor Customers
- Regulatory Pressure
- Negative Reviews
- Expansion
- Multiple Buying Signals

Each play must inherit the active offering context.

---

# EPIC DISC-OFFER-P0-05 — Opportunity Intelligence

### Story DISC-OFFER-P0-05.1 — Discovery Opportunity Model

Create an offering-specific opportunity concept.

Minimum fields:

- opportunity_id
- offering_id
- prospect/account reference
- discovery_definition_id
- score
- priority
- why_them
- why_now
- recommended_action
- confidence
- status
- evidence_count
- created_at
- updated_at
- last_evaluated_at

Statuses:

```text
new
reviewing
action_required
watching
sent_to_crm
dismissed
expired
```

A company can have separate opportunities for different offerings.

Example:

```text
Acme
  Managed IAM Services → 91
  IAM Training         → 63
```

---

### Story DISC-OFFER-P0-05.2 — Opportunity Score

Score should consider:

- ICP fit
- buyer fit
- need/problem fit
- timing
- signal strength
- contactability
- evidence confidence

Display score components.

**Important:** No false precision.

If there is insufficient evidence:

```text
Score: —
Confidence: Low
Reason: Insufficient evidence
```

---

### Story DISC-OFFER-P0-05.3 — Multi-Signal Correlation

Correlate relevant signals for the offering.

Example:

```text
New CISO
+
12 IAM/security openings
+
Identity modernization activity
=
High-confidence IAM opportunity
```

Correlation must retain:

- supporting signal IDs
- rationale
- confidence
- time context

A single weak signal should not automatically become a high-value opportunity.

---

### Story DISC-OFFER-P0-05.4 — Why Now

Produce an offering-specific:

- why_now_summary
- timing_strength
- supporting signals
- evidence
- confidence

Never manufacture urgency.

---

### Story DISC-OFFER-P0-05.5 — Negative Signals

Support signals that reduce opportunity quality:

- wrong industry
- wrong size
- wrong geography
- no relevant problem
- known incompatible solution
- recent rejection
- no buyer
- existing active relationship
- insufficient evidence

Show the reason to the user.

---

# EPIC DISC-OFFER-P0-06 — Evidence & Research

### Story DISC-OFFER-P0-06.1 — Evidence-Backed Research

Every important AI conclusion must have:

- statement
- source
- source URL where available
- source date/observed date
- supporting signal
- confidence
- evidence type

AI must distinguish:

```text
Verified fact
Inference
Hypothesis
Insufficient evidence
```

---

### Story DISC-OFFER-P0-06.2 — Offering Research Brief

Create a concise brief:

```text
Company
Offering Fit
Why Them
Why Now
Likely Buyer
Buying Committee
Problem Hypothesis
Evidence
Potential Objection
Suggested Opening
Recommended Action
Confidence
```

Use progressive disclosure:

1. Decision summary
2. Research brief
3. Expandable evidence
4. Raw signals

---

### Story DISC-OFFER-P0-06.3 — Buyer/Person Intelligence

For each candidate person show:

- name
- title
- seniority
- likely role in buying committee
- relevance to offering
- contactability
- supporting evidence
- confidence

Do not invent people or roles.

---

# EPIC DISC-OFFER-P0-07 — Action-Oriented Discovery

### Story DISC-OFFER-P0-07.1 — Next Best Action

Every actionable opportunity should recommend one primary action:

```text
Research More
Find Better Contact
Draft Message
Send to CRM
Watch
Wait
Dismiss
```

Recommendation must be explainable.

No automatic outbound sending.

---

### Story DISC-OFFER-P0-07.2 — Today's Opportunities

Primary Discovery dashboard should show:

```text
Today's Opportunities
---------------------
Hot
Needs Review
New
Watching
Insufficient Evidence
```

Each row:

```text
Company
Score
Priority
Offering Fit
Why Now
Contact
Top Signal
Recommended Action
```

Desktop: table/proto-table.

Mobile: compact cards.

---

### Story DISC-OFFER-P0-07.3 — Opportunity Detail

Create a dedicated detail view with:

```text
Score
Why Now
Why Them
Primary Contact
Signals
Evidence
Research Brief
Recommended Action
History
Feedback
```

Actions must be clearly grouped.

---

# EPIC DISC-OFFER-P0-08 — CRM Handoff

### Story DISC-OFFER-P0-08.1 — Offering-Aware Discovery → CRM Handoff

Send to CRM:

- business/workspace context
- offering
- account
- selected contact
- opportunity score
- why them
- why now
- research brief
- signals
- recommended action
- discovery definition

CRM owns the post-handoff relationship lifecycle.

---

### Story DISC-OFFER-P0-08.2 — Existing Relationship Detection

Before handoff classify:

```text
New Prospect
Existing Lead
Existing Customer
Existing CRM Opportunity
Existing Contact
Potential Duplicate
```

Prevent duplicate party/relationship creation.

---

### Story DISC-OFFER-P0-08.3 — Handoff Status

Show:

```text
Not Sent
Sent to CRM
Already in CRM
Handoff Failed
```

Allow retry for recoverable failures.

---

# 7. P1 EPICS

## EPIC DISC-OFFER-P1-01 — Continuous Discovery

### Story DISC-OFFER-P1-01.1 — Saved Offering Discovery

Save:

- offering
- ICP
- plays
- signals
- minimum score
- geography
- industries
- buyer roles
- exclusions

Enable/disable monitoring.

---

### Story DISC-OFFER-P1-01.2 — Continuous Monitoring

Monitor new:

- companies
- contacts
- buying signals
- leadership changes
- technology events
- relevant activity

Create opportunities only when meaningful changes occur.

---

### Story DISC-OFFER-P1-01.3 — Account Watchlist

Watch an account for a specific offering.

Fields:

- account
- offering
- watch reason
- current score
- last signal
- next review

Same account can be watched differently for different offerings.

---

### Story DISC-OFFER-P1-01.4 — Grouped Opportunity Alerts

Do not create one alert per raw signal.

Example:

```text
Acme is heating up

New CTO
+ Hiring IAM engineers
+ Cloud migration
```

One opportunity alert.

---

# EPIC DISC-OFFER-P1-02 — Discovery Quality & Learning

### Story DISC-OFFER-P1-02.1 — Prospect Feedback

Capture:

```text
Good Prospect
Bad Prospect
Wrong Person
Wrong Timing
Good Message
Bad Message
Interested
Not Interested
Already Customer
Not Relevant
Spam
```

Optional free-text explanation.

---

### Story DISC-OFFER-P1-02.2 — Discovery Outcome Tracking

Track:

```text
Discovered
Reviewed
Accepted
Contacted
Conversation
CRM Handoff
Qualified
Won
Lost
Nurture
```

Discovery should retain downstream outcome references but not own CRM lifecycle.

---

### Story DISC-OFFER-P1-02.3 — Offering Performance Analysis

Answer:

- Which signals produce conversations?
- Which ICP attributes produce conversions?
- Which buyer roles respond?
- Which Discovery Plays perform best?
- Does a higher score correlate with better outcomes?

---

# EPIC DISC-OFFER-P1-03 — AI Efficiency

### Story DISC-OFFER-P1-03.1 — Progressive Intelligence

Pipeline:

```text
Cheap ICP Filtering
      ↓
Basic Enrichment
      ↓
Signal Detection
      ↓
Scoring
      ↓
Deep Research
      ↓
Personalized Draft
```

Do not run expensive research for every raw prospect.

---

### Story DISC-OFFER-P1-03.2 — Research Cache

Cache reusable research with:

- source
- timestamp
- expiry
- input/context hash
- research version
- AI provider/model

Allow manual refresh.

---

### Story DISC-OFFER-P1-03.3 — Provider-Agnostic Data Contracts

Abstract:

- company enrichment
- person enrichment
- signals
- technology detection
- contact verification

Provider-specific implementations must not leak into the Discovery domain/UI.

---

# EPIC DISC-OFFER-P1-04 — Multi-Offering Intelligence

### Story DISC-OFFER-P1-04.1 — Cross-Offering Account View

Example:

```text
Acme Corp

Managed IAM Services
Score 91 — Hot

IAM Training
Score 68 — Warm

Cyber Risk Assessment
Score 84 — Hot
```

Keep opportunities independent.

---

### Story DISC-OFFER-P1-04.2 — Offering Portfolio Dashboard

Business-level view:

```text
Offering              Hot    New    Conversations
--------------------------------------------------
Managed IAM           12     31        5
IAM Training            4     18        2
Cyber Assessment        8     21        4
```

Allow drill-down.

---

### Story DISC-OFFER-P1-04.3 — Offering-Specific Contact Relevance

The same person can have different roles for different offerings.

The relevance model must be offering-specific.

---

# EPIC DISC-OFFER-P1-05 — Search & Interaction UX

### Story DISC-OFFER-P1-05.1 — Offering-Scoped Search

Filters:

- score
- confidence
- signal type
- industry
- company size
- geography
- technology
- buyer role
- freshness
- status

Results remain scoped to the offering.

---

### Story DISC-OFFER-P1-05.2 — Editable Opportunity Rows

Desktop table row actions:

```text
[Research] [Send to CRM] [•••]
```

Menu:

```text
Edit
Watch
Change Priority
Dismiss
Find Contact
```

Mobile:

```text
[Primary Action] [•••]
```

Editable fields may include:

- priority
- status
- watch state
- owner where supported
- next action
- notes

Changes must be audited where appropriate.

---

### Story DISC-OFFER-P1-05.3 — Responsive Opportunity Workspace

### Desktop

Prefer table/proto-table:

| Company | Score | Fit | Why Now | Contact | Signal | Action |

### Tablet

Use dense adaptive rows.

### Mobile

Use cards:

```text
Company
Score / Priority
Why Now
Primary Contact
Top Signal

[Research] [Action]
```

Secondary details are expandable.

No action/control may overlap.

---

### Story DISC-OFFER-P1-05.4 — Offering Overview UX Polish

Apply the global UI design rule.

Ensure:

- consistent spacing
- clean grouping
- useful borders
- deliberate button placement
- editable controls
- responsive behavior
- empty/error/loading states
- no excessive decorative UI

---

# 8. Suggested Information Architecture

## Business level

```text
Business
├── Overview
└── Offerings
    ├── Offering A
    ├── Offering B
    └── Offering C
```

## Offering level

```text
Offering
├── Overview
├── ICP
├── Discovery
├── Opportunities
├── Signals
├── Watchlist
└── Research
```

## Opportunity level

```text
Opportunity
├── Summary
├── Why Them
├── Why Now
├── Contact
├── Signals
├── Evidence
├── Research
├── Recommended Action
└── CRM Handoff
```

---

# 9. Recommended P0 Sequence

Implement in this order:

```text
1.  DISC-OFFER-P0-01.1 Business Offering
2.  DISC-OFFER-P0-01.2 Product Compatibility
3.  DISC-OFFER-P0-01.3 Offering CRUD UI

4.  DISC-OFFER-P0-02.1 Offering Setup
5.  DISC-OFFER-P0-02.2 Offering ICP
6.  DISC-OFFER-P0-02.3 Buyer Personas

7.  DISC-OFFER-P0-03.1 Context Selector
8.  DISC-OFFER-P0-03.2 Offering Overview
9.  DISC-OFFER-P0-03.3 Navigation

10. DISC-OFFER-P0-04.1 Discovery Definition
11. DISC-OFFER-P0-04.2 Discovery Plays

12. DISC-OFFER-P0-05.1 Opportunity Model
13. DISC-OFFER-P0-05.2 Opportunity Score
14. DISC-OFFER-P0-05.3 Signal Correlation
15. DISC-OFFER-P0-05.4 Why Now
16. DISC-OFFER-P0-05.5 Negative Signals

17. DISC-OFFER-P0-06.1 Evidence
18. DISC-OFFER-P0-06.2 Research Brief
19. DISC-OFFER-P0-06.3 Buyer Intelligence

20. DISC-OFFER-P0-07.1 Next Best Action
21. DISC-OFFER-P0-07.2 Today's Opportunities
22. DISC-OFFER-P0-07.3 Opportunity Detail

23. DISC-OFFER-P0-08.1 CRM Handoff
24. DISC-OFFER-P0-08.2 Existing Relationship Detection
25. DISC-OFFER-P0-08.3 Handoff Status
```

---

# 10. Recommended P1 Sequence

```text
26. DISC-OFFER-P1-01.1 Saved Discovery
27. DISC-OFFER-P1-01.2 Continuous Monitoring
28. DISC-OFFER-P1-01.3 Watchlist
29. DISC-OFFER-P1-01.4 Grouped Alerts

30. DISC-OFFER-P1-02.1 Feedback
31. DISC-OFFER-P1-02.2 Outcome Tracking
32. DISC-OFFER-P1-02.3 Performance Analysis

33. DISC-OFFER-P1-03.1 Progressive Intelligence
34. DISC-OFFER-P1-03.2 Research Cache
35. DISC-OFFER-P1-03.3 Provider Contracts

36. DISC-OFFER-P1-04.1 Cross-Offering Account View
37. DISC-OFFER-P1-04.2 Offering Portfolio
38. DISC-OFFER-P1-04.3 Offering Contact Relevance

39. DISC-OFFER-P1-05.1 Offering Search
40. DISC-OFFER-P1-05.2 Editable Rows
41. DISC-OFFER-P1-05.3 Responsive Workspace
42. DISC-OFFER-P1-05.4 UX Polish
```

---

# 11. Definition of Done

The Discovery module is ready for the next stage when:

- Business Offerings are the primary commercial context.
- A business can define multiple offerings.
- Every offering has its own ICP.
- Every discovery definition belongs to an offering.
- Signals are evaluated for offering relevance.
- Opportunities are offering-specific.
- Opportunity scores are explainable.
- Why Now is evidence-backed.
- Uncertainty is explicitly represented.
- Buying-person relevance is offering-specific.
- Research briefs are evidence-backed.
- Today's Opportunities focuses on actions rather than data volume.
- Continuous discovery can monitor important changes.
- Watchlists are offering-specific.
- Feedback can be captured and later used for learning.
- AI cost is controlled through progressive intelligence and caching.
- CRM handoff preserves offering context.
- Existing Discovery data remains usable.
- Desktop uses table/proto-table presentation where appropriate.
- Mobile remains usable through responsive cards/stacked layouts.
- Editable rows have clear action controls.
- No overlap, clipping or broken button placement exists.
- The UI is polished enough for production use.

---

# 12. Product North Star

The final Discovery experience should feel like:

> **"Tell WonderArc what your business offers. For each offering, it continuously finds the companies most likely to need it, explains why now, identifies who matters, shows the evidence, recommends what to do, and hands qualified relationships to CRM."**

The primary unit is:

**Business Offering → Opportunity**

not:

**Product → Prospect**

The product should optimize for:

**Relevant Offering → High-Confidence Opportunity → Conversation → CRM → Revenue**


# 13. P0 EPIC — Website-to-Offering Autonomous Discovery

## Product Decision

The founder should not be required to manually define Business Offerings first.

Preferred flow:

```text
Business Website URL
        ↓
AI Website Understanding
        ↓
AI identifies Business Offerings
        ↓
Offerings created as editable entries
        ↓
User opens an Offering
        ↓
[Run AI Discovery]
        ↓
Website + external research
        ↓
Offering Profile
        ↓
ICP
        ↓
Buyer Personas
        ↓
Discovery Strategy
        ↓
Accounts
        ↓
Signals
        ↓
Opportunity Scoring
        ↓
Why Now
        ↓
Research / Buying Committee
        ↓
Recommended Action
        ↓
Human Approval
        ↓
CRM Handoff
```

Automation is the default. Every stage remains editable and rerunnable.

## DISC-OFFER-P0-09.1 — Website URL Business Onboarding

Allow the founder to enter only the business website URL.

Example:

```text
Your Business Website

https://example.com

[Understand My Business]
```

The system should inspect the public website and construct an initial business profile.

Extract where available:

- business name
- description
- products/services
- offering categories
- industries served
- customer types
- geographies
- value propositions
- use cases
- problems solved
- pricing/commercial hints
- case studies
- testimonials
- customer logos
- technology/platform information
- FAQs
- contact information
- relevant pages

Every extracted item must distinguish:

```text
Explicitly stated
AI interpretation
Unknown
```

Acceptance criteria:

- URL is validated and normalized.
- Website inspection runs asynchronously.
- Progress is visible.
- Errors are recoverable.
- Extracted facts are traceable to source pages.
- AI never invents missing information.

## DISC-OFFER-P0-09.2 — Website Crawl & Content Discovery

Inspect relevant internal pages, prioritizing:

```text
Home
About
Products
Services
Solutions
Industries
Use Cases
Pricing
Case Studies
Customers
Resources
FAQ
Contact
```

Requirements:

- Stay within the supplied domain by default.
- Respect access/robots restrictions.
- Prevent infinite crawling.
- Deduplicate pages.
- Store source URL and retrieval timestamp.
- Support JavaScript-heavy sites through the available website inspection mechanism.
- Support partial success.

Acceptance criteria:

- Relevant public pages are inspected.
- Extracted facts retain source references.
- Crawl progress is visible.
- Partial crawl results remain usable.

## DISC-OFFER-P0-09.3 — AI Offering Extraction

Automatically identify the Business Offerings from the website.

For every proposed offering create:

```text
Offering Name
Description
Offering Type
Problem Solved
Target Customer
Target Industry
Value Proposition
Evidence
Confidence
Source Pages
```

The AI must consolidate related website pages/features into a sensible commercial offering instead of creating an offering for every feature.

Acceptance criteria:

- Multiple offerings can be identified.
- Duplicate/overlapping offerings can be consolidated.
- Evidence and confidence are shown.
- User can edit, rename, merge, remove or add offerings.

## DISC-OFFER-P0-09.4 — Offering Review Before Activation

After website analysis show:

```text
We found 4 Business Offerings

✓ Managed IAM Services
✓ IAM Consulting
✓ Cyber Risk Assessment
✓ IAM Training

[Edit] [Merge] [Remove]

[Create Offerings]
```

The user explicitly activates the final offering list.

---

# 14. P0 EPIC — One-Click Autonomous Offering Discovery

## DISC-OFFER-P0-10.1 — Run AI Discovery CTA

When the user opens an offering, provide a prominent primary CTA:

> **Run AI Discovery**

Supporting copy:

> Automatically research this offering, build its ICP, identify buyers and signals, find opportunities, and prepare recommended actions.

The button must make it obvious that clicking it starts an automated research process. Do not use ambiguous labels such as `Continue`, `Process`, or `Generate`.

The pipeline should execute:

```text
Understand Offering
→ Research Website
→ Build / Refine ICP
→ Identify Buyer Personas
→ Build Discovery Strategy
→ Find Accounts
→ Enrich Accounts
→ Collect Signals
→ Correlate Signals
→ Score Opportunities
→ Generate Why Now
→ Research Top Opportunities
→ Identify Buying Committee
→ Recommend Next Action
→ Prepare CRM Handoff
```

Acceptance criteria:

- One explicit CTA starts the process.
- Progress is visible.
- Every stage has a persisted status.
- User can leave and return.
- Completed stages remain available.
- Failed stages can be retried.
- No external message is sent automatically.

## DISC-OFFER-P0-10.2 — Persistent Pipeline Stage Model

Create persistent stage state:

```text
website_understanding
offering_profile
icp
buyer_personas
discovery_strategy
account_discovery
signals
signal_correlation
opportunity_scoring
why_now
research
buyer_intelligence
recommended_action
crm_handoff
```

Each stage tracks:

```text
status
started_at
completed_at
failed_at
version
input_version
output_version
error
last_run_id
```

Statuses:

```text
not_started
running
completed
failed
needs_review
skipped
```

Reruns create new versions rather than silently destroying history.

## DISC-OFFER-P0-10.3 — Pipeline Progress UI

Show a clear, non-technical progress experience:

```text
AI Discovery

✓ Website Understanding
✓ Offering Profile
✓ ICP
✓ Buyer Personas
✓ Discovery Strategy
● Signal Intelligence
○ Opportunity Scoring
○ Research
○ Recommended Action
```

Users can inspect completed stages and retry failed stages.

---

# 15. P0 EPIC — Human Override at Any Stage

## DISC-OFFER-P0-11.1 — Editable Pipeline Stages

Automation is the default, but every meaningful stage must be editable.

Available actions:

```text
View
Edit
Save
Run From Here
```

Example:

```text
ICP

Company Size:
100–1000

Industries:
Financial Services
Insurance

[Edit]
```

After editing:

```text
[Save]
[Save & Run Downstream]
```

Acceptance criteria:

- Every editable stage has an obvious edit affordance.
- Changes are persisted.
- User edits are distinguishable/auditable where appropriate.
- Downstream stages can be rerun.

## DISC-OFFER-P0-11.2 — Run From This Stage

If a user changes a stage, allow:

> **Run Discovery From Here**

Example:

```text
ICP changed
      ↓
Buyer Personas
Discovery Strategy
Account Discovery
Signals
Scoring
Why Now
Research
Recommended Action
```

are recomputed.

Upstream completed stages remain intact.

Acceptance criteria:

- User can rerun from any eligible stage.
- Dependent downstream stages are invalidated/recomputed.
- Upstream stages are preserved.
- Existing results are versioned.
- User receives a clear warning before downstream results are replaced.

## DISC-OFFER-P0-11.3 — Stage Dependency Graph

Represent dependencies explicitly:

```text
Website
  ↓
Offering Profile
  ↓
ICP
  ├── Buyer Personas
  └── Discovery Strategy
          ↓
    Account Discovery
          ↓
       Signals
          ↓
 Signal Correlation
          ↓
 Opportunity Scoring
      ├── Why Now
      └── Research
             ↓
      Recommended Action
             ↓
         CRM Handoff
```

Only affected downstream stages should rerun.

---

# 16. P0 EPIC — Offering-Specific Website & External Research

## DISC-OFFER-P0-12.1 — Offering-Specific Website Research

When running an offering, prioritize website content relevant to that offering.

For Managed IAM Services, prioritize:

- IAM/security services
- target customers
- industries
- service delivery
- technologies
- compliance
- case studies
- outcomes
- differentiators

Do not repeatedly process irrelevant pages.

## DISC-OFFER-P0-12.2 — External Opportunity Research

After first-party website understanding, research relevant public external sources for current signals such as:

- company growth
- hiring
- leadership changes
- technology changes
- news
- public social activity
- reviews
- expansion
- relevant business events

Clearly distinguish first-party website evidence from external evidence.

Every external claim must preserve source/date where available.

---

# 17. P0 EPIC — Structured Stage Contracts

## DISC-OFFER-P0-13.1 — Structured Outputs

Every stage must produce structured data, not only prose.

Example ICP:

```text
industries[]
company_size
geographies[]
technologies[]
pain_points[]
buyer_roles[]
disqualifiers[]
confidence
evidence[]
```

Example signal intelligence:

```text
signals[]
correlations[]
opportunity_hypotheses[]
```

Example research:

```text
company_summary
offering_fit
why_them
why_now
buyer
evidence[]
confidence
```

The UI must render these structures as editable fields.

---

# 18. P0 EPIC — Run History and Audit

## DISC-OFFER-P0-14.1 — Discovery Run History

Track:

```text
run_id
offering_id
started_at
completed_at
trigger
starting_stage
status
AI provider/model where applicable
stages executed
errors
user edits
```

Reuse existing Core AI run/audit mechanisms where appropriate.

## DISC-OFFER-P0-14.2 — Versioned Stage Results

Do not silently overwrite prior results.

Example:

```text
ICP v1
ICP v2
ICP v3
```

Current version is clearly identified.

User edits and AI-generated changes should be distinguishable.

---

# 19. P0 EPIC — Final Human Action Gate

## DISC-OFFER-P0-15.1 — Recommended Action Gate

Automation should stop before external action.

Example:

```text
Top Opportunity

Acme Corp
Score: 92

Why Now:
New CISO + IAM hiring + transformation activity

Contact:
Priya Sharma — CISO

Recommended Action:
Start conversation

Confidence:
High

[Edit Recommendation]
[Send to CRM]
[Watch]
[Dismiss]
```

No outbound communication may be sent automatically.

CRM handoff must preserve the Business Offering and Discovery evidence.

---

# 20. P1 — Autonomous Re-Discovery

## DISC-OFFER-P1-01.1 — Scheduled Offering Re-Discovery

Allow an offering to run again on a schedule.

```text
Last discovery: Today, 10:30
Next discovery: Tomorrow

[Run Now]
```

Only meaningful changes should create new opportunities.

## DISC-OFFER-P1-01.2 — Incremental Re-Run

When a new signal arrives, do not rerun the whole pipeline.

Example:

```text
New signal
→ Re-score affected opportunity
→ Recalculate Why Now
→ Update recommended action
```

---

# 21. P1 — Smart Review

## DISC-OFFER-P1-02.1 — Review Required Indicators

Show:

```text
✓ High confidence — automated
⚠ Needs review
? Insufficient evidence
```

The user can still edit any stage.

## DISC-OFFER-P1-02.2 — Rerun Impact Confirmation

Before rerunning:

```text
Changing ICP will update:

✓ Buyer Personas
✓ Discovery Strategy
✓ Account Discovery
✓ Signals
✓ Opportunity Scores
✓ Research
✓ Recommended Actions

[Save & Run Downstream]
[Save Only]
[Cancel]
```

---

# 22. P1 — Offering Quality

## DISC-OFFER-P1-03.1 — Offering Definition Quality

After website analysis show a diagnostic:

```text
Offering Definition Quality: 86/100

Description       Strong
Target Customer   Strong
ICP Evidence      Medium
Buyer Evidence    Medium
Differentiation   Strong
```

## DISC-OFFER-P1-03.2 — Missing Information Suggestions

Tell the founder what is uncertain:

```text
We understand what you sell.

We are less certain about:
- Ideal customer size
- Primary buyer
- Geographic focus

[Research Further]
[Edit Manually]
```

Never manufacture missing information.

---

# 23. P1 — Learning From Human Corrections

## DISC-OFFER-P1-04.1 — Learn From User Edits

Capture recurring corrections:

```text
AI: Target industry = Retail
User: Target industry = Banking
```

Store this as structured offering feedback.

Do not silently retrain models.

## DISC-OFFER-P1-04.2 — Learn From Outcomes

Connect:

```text
Offering
→ Discovery
→ Opportunity
→ Contact
→ Conversation
→ CRM
→ Outcome
```

Measure whether Discovery produces useful opportunities.

---

# 24. P1 — Automated Workflow UX

## DISC-OFFER-P1-05.1 — Offering Pipeline Workspace

Desktop target layout:

```text
┌───────────────────────────────────────────────────────┐
│ Managed IAM Services                    [Edit]        │
│                                                       │
│ AI Discovery                                          │
│                                                       │
│ ✓ Website  ✓ ICP  ✓ Buyers  ● Signals  ○ Research   │
│                                                       │
│ ┌───────────────────────────────────────────────────┐ │
│ │ Current Stage: Signal Intelligence                │ │
│ │                                                   │ │
│ │ 18 relevant signals found                         │ │
│ │ 6 high-confidence correlations                    │ │
│ │                                                   │ │
│ │ [Review Stage] [Edit] [Run From Here]            │ │
│ └───────────────────────────────────────────────────┘ │
│                                                       │
│              [Run AI Discovery]                       │
└───────────────────────────────────────────────────────┘
```

The exact visual implementation may differ, but the hierarchy must remain clear.

## DISC-OFFER-P1-05.2 — Desktop Stage Tables

Use table/proto-table presentation for multi-record outputs.

### Opportunities

| Company | Score | Why Now | Contact | Confidence | Action |
|---|---:|---|---|---|---|

### Signals

| Signal | Source | Date | Relevance | Confidence | Action |
|---|---|---|---|---|---|

### Buyers

| Person | Role | Fit | Evidence | Confidence | Action |
|---|---|---|---|---|---|

Use stacked cards/progressive disclosure on mobile.

## DISC-OFFER-P1-05.3 — Editable Stage Rows

Desktop:

```text
Company | Score | Signal | Contact | [Edit] [•••]
```

Menu:

```text
Edit
Research Again
Exclude
Watch
Send to CRM
```

Mobile:

```text
[Primary Action] [•••]
```

Do not force users through a separate detail screen for simple row edits.

---

# 25. Automation Safety

The automated flow may:

- inspect public website content
- research public information
- structure information
- create/update Discovery records
- score opportunities
- generate recommendations
- prepare CRM handoff

It must NOT:

- send outbound communication without user approval
- invent evidence
- claim inaccessible information was found
- silently overwrite user-approved values
- silently erase previous stage versions
- create duplicate accounts/opportunities
- bypass RLS/licensing/tenancy
- access private information without authorized integration

---

# 26. Website Failure States

Support:

### Invalid URL

```text
We couldn't recognize this website address.
```

### Website unavailable

```text
The website could not be reached.
[Retry]
```

### Partial crawl

```text
We inspected 18 of 25 relevant pages.
Some information may be incomplete.
[View Details]
```

### No clear offerings

```text
We couldn't confidently identify your offerings.

[Define Offering Manually]
[Try Deeper Research]
```

Never fabricate offerings to make onboarding appear successful.

---

# 27. Target End-to-End Experience

## Step 1 — Enter website

```text
Tell us about your business

Website URL

[https://example.com]

[Understand My Business]
```

## Step 2 — Offerings discovered

```text
We found 4 Business Offerings

✓ Managed IAM Services
✓ IAM Consulting
✓ Cyber Risk Assessment
✓ IAM Training

[Create Offerings]
```

## Step 3 — Open offering

```text
Managed IAM Services

[Run AI Discovery]
```

Supporting copy clearly states that the action will research the website/public information and automatically populate the downstream Discovery stages.

## Step 4 — Automated pipeline

```text
✓ Website Understanding
✓ Offering Profile
✓ ICP
✓ Buyer Personas
✓ Discovery Strategy
● Account Discovery
○ Signals
○ Opportunity Scoring
○ Research
○ Recommended Action
```

## Step 5 — User intervention whenever desired

At every stage:

```text
[View]
[Edit]
[Save]
[Run From Here]
```

## Step 6 — Final decision

```text
Top Opportunity

Acme Corp
Score 92
Why Now:
New CISO + IAM hiring + transformation activity

Contact:
Priya Sharma — CISO

Recommended Action:
Start conversation

[Edit Recommendation]
[Send to CRM]
[Watch]
[Dismiss]
```

---

# 28. Product North Star for This Feature

> **Enter your website once. WonderArc understands what your business offers. Open an offering and click Run AI Discovery. WonderArc does the research and builds the ICP, buyers, discovery strategy, signals, opportunities, Why Now analysis and recommended actions automatically. The founder can intervene at any stage, edit values, save them, and rerun the process from that point onward. Nothing external is sent without final approval.**

The fundamental unit remains:

**Business Offering → Opportunity**

and the operational model becomes:

**Website → Offering → Automated Discovery Pipeline → Human Decision → CRM**

# 29. Master Implementation Sequence — REQUIRED

The foundational Offering/ICP/Opportunity stories and the autonomous website pipeline are one coherent P0/P1 backlog. The website pipeline is **P0**, not an optional appendix.

## Phase A — Offering Foundation

```text
DISC-OFFER-P0-01.1  Business Offering
DISC-OFFER-P0-01.2  Existing Product Compatibility
DISC-OFFER-P0-01.3  Offering CRUD UI
DISC-OFFER-P0-02.1  Offering Setup
DISC-OFFER-P0-02.2  Offering ICP
DISC-OFFER-P0-02.3  Buyer Personas
```

## Phase B — Offering-Centric Workspace

```text
DISC-OFFER-P0-03.1  Offering Context Selector
DISC-OFFER-P0-03.2  Offering Overview
DISC-OFFER-P0-03.3  Offering Navigation
DISC-OFFER-P0-04.1  Discovery Definition
DISC-OFFER-P0-04.2  Discovery Plays
```

## Phase C — Opportunity Intelligence

```text
DISC-OFFER-P0-05.1  Opportunity Model
DISC-OFFER-P0-05.2  Opportunity Score
DISC-OFFER-P0-05.3  Multi-Signal Correlation
DISC-OFFER-P0-05.4  Why Now
DISC-OFFER-P0-05.5  Negative Signals
DISC-OFFER-P0-06.1  Evidence-Backed Research
DISC-OFFER-P0-06.2  Research Brief
DISC-OFFER-P0-06.3  Buyer Intelligence
DISC-OFFER-P0-07.1  Next Best Action
DISC-OFFER-P0-07.2  Today's Opportunities
DISC-OFFER-P0-07.3  Opportunity Detail
```

## Phase D — CRM Boundary

```text
DISC-OFFER-P0-08.1  Offering-Aware CRM Handoff
DISC-OFFER-P0-08.2  Existing Relationship Detection
DISC-OFFER-P0-08.3  Handoff Status
```

## Phase E — Autonomous Website-to-Offering Pipeline (P0)

```text
DISC-OFFER-P0-09.1  Website URL Business Onboarding
DISC-OFFER-P0-09.2  Website Crawl & Content Discovery
DISC-OFFER-P0-09.3  AI Offering Extraction
DISC-OFFER-P0-09.4  Offering Review Before Activation
DISC-OFFER-P0-10.1  Run AI Discovery CTA
DISC-OFFER-P0-10.2  Persistent Pipeline Stage Model
DISC-OFFER-P0-10.3  Pipeline Progress UI
DISC-OFFER-P0-11.1  Editable Pipeline Stages
DISC-OFFER-P0-11.2  Run From This Stage
DISC-OFFER-P0-11.3  Stage Dependency Graph
DISC-OFFER-P0-12.1  Offering-Specific Website Research
DISC-OFFER-P0-12.2  External Opportunity Research
DISC-OFFER-P0-13.1  Structured Stage Outputs
DISC-OFFER-P0-14.1  Discovery Run History
DISC-OFFER-P0-14.2  Versioned Stage Results
DISC-OFFER-P0-15.1  Final Human Action Gate
```

## Phase F — P1 Automation, Learning and UX

```text
DISC-OFFER-P1-01.1  Scheduled Offering Re-Discovery
DISC-OFFER-P1-01.2  Incremental Re-Run
DISC-OFFER-P1-02.1  Review Required Indicators
DISC-OFFER-P1-02.2  Rerun Impact Confirmation
DISC-OFFER-P1-03.1  Offering Definition Quality
DISC-OFFER-P1-03.2  Missing Information Suggestions
DISC-OFFER-P1-04.1  Learn From User Edits
DISC-OFFER-P1-04.2  Learn From Outcomes
DISC-OFFER-P1-05.1  Offering Pipeline Workspace
DISC-OFFER-P1-05.2  Desktop Stage Tables
DISC-OFFER-P1-05.3  Editable Stage Rows
```

Claude Code must **not** finish the first 25 foundational stories and consider the product complete. The autonomous website-to-offering pipeline uses the same Offering, ICP, Discovery Definition, Signal, Opportunity, Research, Stage/Version and CRM contracts.

# 30. Canonical Target Workflow

```text
BUSINESS
   ↓
Enter website URL
   ↓
WEBSITE UNDERSTANDING
   ↓
AI identifies BUSINESS OFFERINGS
   ↓
OFFERING REVIEW
   ↓
BUSINESS OFFERINGS
   ↓
Select an offering
   ↓
[ RUN AI DISCOVERY ]
   ↓
AUTOMATED PIPELINE
   ├── Offering Profile
   ├── ICP
   ├── Buyer Personas
   ├── Discovery Strategy
   ├── Account Discovery
   ├── Signals
   ├── Signal Correlation
   ├── Opportunity Scoring
   ├── Why Now
   ├── Research
   ├── Buying Committee
   └── Recommended Action
             ↓
       HUMAN DECISION
        ┌────┼─────┐
        ↓    ↓     ↓
      CRM   Watch  Dismiss
```

At every meaningful stage the user can **View → Edit → Save → Run From Here**. Editing a stage invalidates only dependent downstream stages.

# 31. Canonical Stage Dependency Rules

```text
Website Understanding
        ↓
Offering Profile
        ↓
ICP
   ┌────┴────┐
   ↓         ↓
Buyers    Discovery Strategy
              ↓
        Account Discovery
              ↓
           Signals
              ↓
      Signal Correlation
              ↓
      Opportunity Scoring
          ┌───┴────┐
          ↓        ↓
       Why Now   Research
                    ↓
           Buying Committee
                    ↓
          Recommended Action
                    ↓
              CRM Handoff
```

If ICP changes, recompute buyer personas, discovery strategy and all dependent downstream stages. If only the final recommendation changes, do not rerun upstream research. The dependency graph must be represented in code/configuration and covered by tests.

# 32. Canonical Automation UX Rule

The automated pipeline should feel like an AI employee doing the work, not a wizard forcing the founder through forms.

Bad:

```text
Next → Next → Next → Next
```

Target:

```text
AI Discovery is running...

✓ Understood your offering
✓ Built your ICP
✓ Identified likely buyers
✓ Found relevant accounts
✓ Detected meaningful signals
● Ranking opportunities

You can review or edit any completed stage at any time.
```

The founder should be able to let the process run end-to-end, leave the page and return later, or intervene at any point.

# 33. Canonical "Run AI Discovery" CTA Rule

The primary CTA must clearly communicate that it will perform automated research.

Preferred:

> **Run AI Discovery**

Supporting copy:

> WonderArc will research this offering, build/refine the ICP, find relevant accounts and signals, research the strongest opportunities, and prepare recommended actions.

Do not use ambiguous labels such as `Continue`, `Generate`, `Process`, or `Go` as the sole explanation of the action.

# 34. Canonical Human Override Rule

Automation is the default; user control is permanent.

```text
AI Result
   ↓
[Edit]
   ↓
User changes values
   ↓
[Save]
   ↓
[Run From Here]
   ↓
Affected downstream stages recompute
```

The user must never be forced to restart from the beginning after correcting an upstream stage.

# 35. Canonical Product Definition

The completed Discovery module is not:

> A tool where users enter products and search for prospects.

It is:

> **An AI customer-discovery engine that understands a business from its website, identifies its Business Offerings, and continuously discovers high-confidence customer opportunities for each offering.**

The defining loop is:

```text
Understand
→ Discover
→ Correlate
→ Prioritize
→ Research
→ Recommend
→ Human Decision
→ Learn
```

This entire loop is part of the Discovery product and must be represented coherently in the implementation backlog.
