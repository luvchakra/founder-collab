# WonderArc Platform Administration Portal — P0/P1 Requirements & Implementation Backlog

## 1. Purpose

Build a **Platform Administration Portal** for WonderArc that operates at:

```text
https://<base-url>/platform
```

This is **not** a business/customer administration screen.

It is the control plane for the WonderArc SaaS platform itself.

A new privileged role is required:

```text
SUPERADMIN
```

The Platform Administration Portal must allow authorized WonderArc platform operators to configure capabilities that can affect **all WonderArc customers/businesses**.

The portal must therefore be designed as a high-risk administrative control plane with:

- strict authorization
- auditability
- configuration versioning
- impact visibility
- safe defaults
- rollback where practical
- explicit confirmation for global changes
- separation from ordinary customer/business administration

---

# 2. Product Vision

The Platform Admin should be able to answer:

> "How is WonderArc configured globally, what can customers use, what does each subscription include, which AI/providers are available, what does the platform look like, and what changes will affect customers?"

Core model:

```text
WonderArc Platform
        │
        ├── Global Branding
        ├── Subscription Plans
        ├── Feature Entitlements
        ├── Usage Limits
        ├── Module Availability
        ├── AI Providers / Keys
        ├── Country / Compliance Packs
        ├── System Policies
        ├── Notifications
        ├── Integrations
        ├── Security Policies
        ├── Platform Operations
        └── Audit / Change Management
```

---

# 3. Critical Architecture Principle

The Platform Admin Portal is a **control plane**, not a tenant.

It must not be implemented as a normal customer/business account with elevated UI permissions.

Recommended separation:

```text
apps/web
   │
   ├── Customer Application
   │
   └── /platform
         │
         ├── Platform Admin UI
         ├── Platform RBAC
         ├── Platform Configuration
         ├── Platform Audit
         └── Platform Operations
```

Platform configuration should be owned by a platform-level schema/domain, not by:

```text
core.business
```

or any customer-owned module schema.

Recommended conceptual schemas:

```text
core
platform
discovery
inventory
fsm
crm
gst/compliance
```

Platform configuration belongs in:

```text
platform.*
```

where practical.

---

# 4. Platform URL

Primary route:

```text
<base_url>/platform
```

Suggested routes:

```text
/platform
/platform/dashboard
/platform/branding
/platform/plans
/platform/entitlements
/platform/limits
/platform/modules
/platform/ai
/platform/countries
/platform/integrations
/platform/notifications
/platform/security
/platform/policies
/platform/operations
/platform/audit
/platform/settings
```

The portal must not be exposed through normal customer navigation.

---

# 5. SUPERADMIN Role

## PLATFORM-P0-01.1 — Create SUPERADMIN Role

Create a platform-level:

```text
SUPERADMIN
```

This role is distinct from customer/business roles.

Do not make:

```text
business_admin
owner
manager
```

equivalent to SUPERADMIN.

## PLATFORM-P0-01.2 — Platform Authorization

Every `/platform/*` route and every platform mutation must independently verify:

```text
authenticated user
AND
platform-level authorization
```

Never rely only on hiding navigation.

## PLATFORM-P0-01.3 — Platform Session Context

When a SUPERADMIN enters the portal, the UI must clearly indicate:

```text
Platform Administration
SUPERADMIN
```

This reduces the chance of confusing platform-wide actions with business-level actions.

## PLATFORM-P0-01.4 — No Tenant Context Required

Platform administration must operate independently of the currently selected customer business.

---

# 6. Platform Dashboard

## PLATFORM-P0-02.1 — Platform Overview

Dashboard should show:

```text
Businesses
Active Users
Active Subscriptions
MRR / ARR
Licensed Modules
AI Usage
API Usage
System Health
Open Platform Issues
Recent Configuration Changes
```

Do not expose sensitive customer data unnecessarily.

## PLATFORM-P0-02.2 — Platform Configuration Health

Show:

```text
AI providers configured
Payment provider configured
Email configured
WhatsApp providers configured
Country packs enabled
Subscription plans active
Feature flags active
```

## PLATFORM-P0-02.3 — Recent Global Changes

Example:

```text
Pricing Plan Pro updated
Discovery feature enabled for Max
Gemini provider key rotated
Maintenance banner published
```

---

# 7. Branding & Look and Feel

## PLATFORM-P0-03.1 — WonderArc Branding

Configure:

```text
Platform Name
Logo
Favicon
Primary Brand
Secondary Brand
Accent Color
Login Branding
Email Branding
Footer
Support Contact
```

## PLATFORM-P0-03.2 — Global Design Tokens

Configure platform-wide design tokens where appropriate:

```text
primary color
accent color
border radius
button style
font family
spacing density
```

Do not allow arbitrary CSS injection through the admin UI.

## PLATFORM-P0-03.3 — Platform Login Branding

Configure:

```text
logo
headline
support text
background treatment
legal links
```

## PLATFORM-P0-03.4 — Customer-Facing Branding Scope

Clearly distinguish:

```text
WonderArc Platform Branding
```

from future:

```text
Business-level branding
```

Business administrators must not be able to change WonderArc's global brand.

## PLATFORM-P0-03.5 — Preview Before Publish

Provide:

```text
Edit
Preview
Publish
```

Global branding changes should not become active merely because a field was edited.

---

# 8. Subscription / Pricing Plans

## PLATFORM-P0-04.1 — Plan Management

Initial plans:

```text
Free
Pro
Max
```

Plan configuration:

```text
name
description
price
billing interval
currency
status
display order
marketing visibility
```

## PLATFORM-P0-04.2 — Plan Entitlements

Each plan must support configurable feature entitlements.

Example:

```text
Discovery
✓ enabled
maximum offerings = 3
maximum active opportunities = 100

CRM
✓ enabled
maximum users = 5

Inventory
✓ enabled

FSM
✗ disabled
```

## PLATFORM-P0-04.3 — Module Entitlements

Configure which modules each plan includes:

```text
Discovery
Inventory
FSM
CRM
Compliance
```

## PLATFORM-P0-04.4 — Feature-Level Entitlements

Go beyond module-level licensing.

Example:

```text
Discovery:
AI Research
Website Understanding
Continuous Discovery
Advanced Signals

CRM:
WhatsApp
Social Inbox
Review Recovery
AI Relationship Intelligence

Compliance:
India GST
E-Invoicing
E-Way Bill
Advanced Reconciliation
```

## PLATFORM-P0-04.5 — Quantity Limits

Configurable limits:

```text
businesses
users
business offerings
products
contacts
prospects
opportunities
AI runs
AI credits
WhatsApp conversations
storage
API calls
automation runs
```

Limits must be data-driven.

## PLATFORM-P0-04.6 — Unlimited Support

Support:

```text
numeric limit
unlimited
disabled
```

Do not represent unlimited as an arbitrary huge number.

## PLATFORM-P0-04.7 — Plan Lifecycle

Support:

```text
Draft
Active
Deprecated
Archived
```

Do not delete plans that have historical subscribers.

---

# 9. Entitlement Engine

## PLATFORM-P0-05.1 — Central Entitlement Service

Create one authoritative service:

```text
hasFeature(business, feature)
hasModule(business, module)
getLimit(business, resource)
canConsume(business, resource, quantity)
```

All customer modules must use this service.

## PLATFORM-P0-05.2 — Entitlement Precedence

Recommended:

```text
Platform Global
      ↓
Plan
      ↓
Business Override
      ↓
User Permission
```

However, a business override must never exceed platform safety/security restrictions unless explicitly allowed by platform policy.

## PLATFORM-P0-05.3 — Entitlement Evaluation

Every entitlement decision should return:

```text
allowed
reason
source
limit
usage
remaining
```

Example:

```text
Allowed: false
Reason: Pro plan allows 5 businesses
Usage: 5
Remaining: 0
Source: Pro plan
```

## PLATFORM-P0-05.4 — Existing Licensing Integration

Integrate with the existing WonderArc licensing model rather than creating a competing licensing system.

---

# 10. Usage & Limits

## PLATFORM-P0-06.1 — Usage Counters

Track configurable usage dimensions.

## PLATFORM-P0-06.2 — Usage Dashboard

Show:

```text
Current Usage
Plan Limit
Remaining
Projected Usage
```

## PLATFORM-P0-06.3 — Limit Enforcement

Enforce limits server-side.

UI-only restrictions are not sufficient.

## PLATFORM-P0-06.4 — Graceful Limit UX

Example:

```text
You've reached your Pro plan limit of 100 active opportunities.

[Upgrade]
[View Usage]
```

## PLATFORM-P0-06.5 — Soft vs Hard Limits

Support:

```text
Soft Limit
Hard Limit
Warning Threshold
```

---

# 11. Module Administration

## PLATFORM-P0-07.1 — Module Registry

Manage:

```text
Discovery
Inventory
FSM
CRM
Compliance
```

Each module:

```text
enabled
visible
licensed
minimum_plan
status
version
```

## PLATFORM-P0-07.2 — Platform-Wide Module Kill Switch

Allow authorized platform operators to disable a module globally.

This is a dangerous operation and must require:

```text
reason
impact confirmation
explicit confirmation
audit record
```

## PLATFORM-P0-07.3 — Module Maintenance Mode

Set:

```text
Available
Read-only
Maintenance
Disabled
```

with optional customer-facing message.

---

# 12. Feature Flags

## PLATFORM-P0-08.1 — Global Feature Flags

Create platform-level flags:

```text
feature_key
description
enabled
effective_from
effective_to
```

## PLATFORM-P0-08.2 — Feature Flag Scope

Support:

```text
Global
Plan
Module
Country
```

Business/user-level targeting can be P1.

## PLATFORM-P0-08.3 — Kill Switches

Use flags for emergency disabling of:

- AI research
- outbound messaging
- WhatsApp integration
- government submission
- expensive external APIs
- new experimental features

## PLATFORM-P0-08.4 — Feature Flag Audit

Every change must record:

```text
who
what
old value
new value
reason
timestamp
```

---

# 13. Internal AI Provider & Keys

This is a major platform capability.

## PLATFORM-P0-09.1 — Internal AI Provider Registry

Support:

```text
OpenAI
Anthropic
Google Gemini
Other future providers
```

Configuration:

```text
provider
enabled
models
default model
fallback model
rate limits
cost controls
```

## PLATFORM-P0-09.2 — Secure API Key Storage

Keys must be stored using secure secret handling.

Never:

- expose full keys in UI
- log keys
- return keys to browser clients
- store them in ordinary configuration tables as plaintext

UI should show:

```text
Configured
••••••••abcd
```

## PLATFORM-P0-09.3 — Provider Routing

Configure:

```text
default provider
default model
module-specific provider
fallback provider
```

Example:

```text
Discovery → Gemini
CRM → OpenAI
Compliance → OpenAI
```

## PLATFORM-P0-09.4 — AI Feature Policies

Configure:

```text
AI enabled
allowed providers
allowed models
maximum tokens
maximum run cost
daily platform budget
```

## PLATFORM-P0-09.5 — AI Usage

Track:

```text
provider
model
module
business
run
tokens
estimated cost
status
```

Do not expose secret credentials.

---

# 14. AI Safety / Cost Controls

## PLATFORM-P0-10.1 — Platform AI Budget

Configure:

```text
daily budget
monthly budget
per-business budget
per-feature budget
```

## PLATFORM-P0-10.2 — AI Circuit Breaker

If configured threshold is exceeded:

```text
Pause AI
```

and notify SUPERADMIN.

## PLATFORM-P0-10.3 — Provider Failure Fallback

Allow:

```text
Primary
→ Fallback
→ Fail gracefully
```

## PLATFORM-P0-10.4 — AI Feature Kill Switch

Disable a specific AI feature globally without disabling the entire module.

---

# 15. Global Email / Notification Configuration

## PLATFORM-P0-11.1 — Email Provider

Configure:

```text
provider
from name
from email
reply-to
```

## PLATFORM-P0-11.2 — System Email Templates

Manage templates for:

- welcome
- verification
- password/security events
- subscription
- usage limits
- compliance reminders
- system announcements

## PLATFORM-P0-11.3 — Notification Policies

Configure platform defaults for:

```text
email
in-app
push
```

---

# 16. Global Integrations

## PLATFORM-P0-12.1 — Integration Registry

Central list:

```text
AI
Email
WhatsApp
Payments
Government
Analytics
Storage
```

## PLATFORM-P0-12.2 — Integration Status

Show:

```text
Connected
Disconnected
Error
Needs Reauthorization
Disabled
```

## PLATFORM-P0-12.3 — Integration Kill Switch

Allow emergency disabling.

## PLATFORM-P0-12.4 — Credential Separation

Customer-owned credentials and WonderArc-owned platform credentials must be separate.

---

# 17. Country / Compliance Pack Administration

## PLATFORM-P0-13.1 — Country Registry

Manage:

```text
India
EU/member states
US
Canada
Singapore
UAE
Saudi Arabia
Australia
New Zealand
Malaysia
etc.
```

## PLATFORM-P0-13.2 — Compliance Pack Availability

Configure:

```text
country
regime
enabled
supported features
version
```

## PLATFORM-P0-13.3 — Rule Version

Country rules must have:

```text
version
effective_from
effective_to
source
status
```

## PLATFORM-P0-13.4 — Compliance Feature Flags

Example:

```text
India
GST = enabled
E-Invoice = enabled
E-Way Bill = enabled
IMS = enabled
```

---

# 18. Platform Policies

## PLATFORM-P0-14.1 — Global System Policies

Central configuration for:

```text
session duration
password policy
file size limits
API rate limits
default timezone
default currency
data retention defaults
audit retention
```

Country-specific/legal rules must not be incorrectly overridden by generic platform settings.

## PLATFORM-P0-14.2 — Data Retention Policy

Configure platform-level defaults.

Country/regulatory-specific retention must take precedence where applicable.

## PLATFORM-P0-14.3 — Rate Limits

Configure:

```text
API
AI
webhooks
imports
exports
automation
```

---

# 19. Global Announcements / Maintenance

## PLATFORM-P0-15.1 — Announcement Manager

Publish:

```text
Information
Warning
Maintenance
Critical
```

## PLATFORM-P0-15.2 — Audience

P0:

```text
All Customers
All Users
Specific Plan
Specific Country
```

## PLATFORM-P0-15.3 — Scheduled Announcement

Support:

```text
publish_at
expire_at
```

## PLATFORM-P0-15.4 — Maintenance Mode

Configure:

```text
start
end
message
affected modules
```

---

# 20. Platform Audit

## PLATFORM-P0-16.1 — Immutable Platform Audit Log

Every platform mutation must capture:

```text
actor
action
resource
resource_id
old_value
new_value
timestamp
IP/device metadata where appropriate
reason
```

## PLATFORM-P0-16.2 — High-Risk Action Audit

Mandatory audit for:

- plan changes
- entitlement changes
- global disable
- AI key changes
- security policy changes
- integrations
- compliance rule changes
- data retention
- impersonation
- maintenance mode

## PLATFORM-P0-16.3 — Audit Search

Filters:

```text
date
actor
resource
action
severity
```

## PLATFORM-P0-16.4 — Configuration History

Allow administrators to inspect previous versions.

---

# 21. Safe Global Change Workflow

Any high-impact change should follow:

```text
Edit
 ↓
Validate
 ↓
Show Impact
 ↓
Confirm
 ↓
Publish
 ↓
Audit
```

Example:

```text
You're enabling Advanced Discovery for Pro.

Estimated impact:
2,840 active businesses
+ estimated AI usage
+ potential storage usage

[Cancel]
[Confirm & Publish]
```

---

# 22. Configuration Versioning

## PLATFORM-P0-17.1 — Version Configuration

Important platform configuration should have versions.

Examples:

```text
Plan Pro v3
AI Routing v5
Branding v7
India GST Pack v12
```

## PLATFORM-P0-17.2 — Draft vs Published

Support:

```text
Draft
Published
Archived
```

## PLATFORM-P0-17.3 — Rollback

Where technically safe:

```text
View Version
Restore
```

Rollback itself must be audited.

---

# 23. Platform Settings Import/Export

## PLATFORM-P1-01.1 — Configuration Export

Export non-secret configuration.

## PLATFORM-P1-01.2 — Configuration Import

Import validated configuration into another environment.

## PLATFORM-P1-01.3 — Secret Exclusion

Never export:

- API keys
- passwords
- OAuth secrets
- private credentials

---

# 24. Business-Level Exceptions

## PLATFORM-P1-02.1 — Business Override

Allow SUPERADMIN to grant exceptions:

```text
Business A
Plan: Pro
Temporary Discovery limit: 500
Expires: 30 days
Reason: Enterprise pilot
```

## PLATFORM-P1-02.2 — Temporary Entitlement

Every override must have:

```text
reason
created_by
start
expiry
```

## PLATFORM-P1-02.3 — Override Audit

All overrides audited.

---

# 25. Customer Support Tools

## PLATFORM-P1-03.1 — Customer Search

Search by:

```text
business name
business ID
admin email
subscription
country
status
```

Avoid exposing unnecessary sensitive information.

## PLATFORM-P1-03.2 — Customer Configuration View

Show:

```text
Plan
Entitlements
Usage
Enabled modules
Country
Integrations
AI usage
Recent errors
```

## PLATFORM-P1-03.3 — Safe Impersonation

If implemented, require:

```text
SUPERADMIN
explicit reason
time-limited session
prominent "Impersonating" banner
full audit
```

Do not permit privileged operations while impersonating unless explicitly designed and separately authorized.

---

# 26. Subscription Lifecycle

## PLATFORM-P1-04.1 — Plan Change Rules

Configure:

```text
upgrade
downgrade
proration policy
effective date
```

## PLATFORM-P1-04.2 — Trial Configuration

Configure:

```text
trial duration
eligible plans
trial entitlements
```

## PLATFORM-P1-04.3 — Grace Period

Configure:

```text
payment grace
feature grace
data retention after cancellation
```

## PLATFORM-P1-04.4 — Cancellation Behavior

Must align with existing WonderArc rule:

```text
cancel
→ grace period
→ locked
```

Never automatically delete customer data merely because a subscription ends.

---

# 27. Platform Billing Configuration

## PLATFORM-P1-05.1 — Currency

Configure supported currencies.

## PLATFORM-P1-05.2 — Billing Provider

Configure provider and environment.

## PLATFORM-P1-05.3 — Tax on Subscription Billing

Support platform subscription tax configuration separately from customer Compliance tax.

Do not mix:

```text
WonderArc's subscription tax
```

with:

```text
Customer's business tax compliance
```

## PLATFORM-P1-05.4 — Price Versioning

Historical subscriptions must retain the price/plan version under which they were created.

---

# 28. Platform API Administration

## PLATFORM-P1-06.1 — API Policy

Configure:

```text
rate limits
burst limits
payload limits
```

## PLATFORM-P1-06.2 — API Key Management

Platform-level service/API keys where required.

## PLATFORM-P1-06.3 — Webhook Policies

Configure:

```text
retry count
timeout
signature policy
```

## PLATFORM-P1-06.4 — API Usage Dashboard

Show aggregate platform usage.

---

# 29. Observability & Operations

## PLATFORM-P1-07.1 — System Health

Show:

```text
Database
AI providers
Email
WhatsApp
Storage
Queues
External integrations
```

## PLATFORM-P1-07.2 — Error Rate

Aggregate:

```text
API errors
AI failures
webhook failures
integration failures
```

## PLATFORM-P1-07.3 — Queue Health

Where asynchronous workers exist:

```text
queued
processing
failed
dead-letter
```

## PLATFORM-P1-07.4 — Operational Alerts

Notify platform operators when critical thresholds are exceeded.

---

# 30. Release Management

## PLATFORM-P1-08.1 — Platform Version

Show:

```text
WonderArc version
build
deployment
environment
```

## PLATFORM-P1-08.2 — Feature Rollout

Support staged rollout:

```text
Internal
Pilot
Selected Plans
All Customers
```

## PLATFORM-P1-08.3 — Rollback Flag

Allow feature disable without necessarily reverting application code.

---

# 31. Legal / Policy Configuration

## PLATFORM-P1-09.1 — Terms & Privacy Version

Configure active versions.

## PLATFORM-P1-09.2 — Cookie / Consent Configuration

Where applicable.

## PLATFORM-P1-09.3 — Legal Link Management

Configure:

```text
Terms
Privacy
Cookie Policy
DPA
Support
```

## PLATFORM-P1-09.4 — Policy Acceptance Tracking

Track accepted policy version where required.

---

# 32. Platform Security Controls

## PLATFORM-P0-18.1 — MFA Required for SUPERADMIN

SUPERADMIN accounts must require strong authentication.

## PLATFORM-P0-18.2 — Reauthentication for High-Risk Actions

Require recent authentication for actions such as:

- changing AI secrets
- changing authentication/security policy
- changing billing configuration
- disabling a module
- changing platform-wide entitlements

## PLATFORM-P0-18.3 — Least Privilege

Future platform roles should be possible:

```text
SUPERADMIN
PLATFORM_ADMIN
BILLING_ADMIN
SUPPORT_ADMIN
OPERATIONS_ADMIN
SECURITY_ADMIN
```

P0 only requires SUPERADMIN, but the architecture must not hard-code a single future role.

## PLATFORM-P0-18.4 — Destructive Action Protection

Global destructive actions require:

```text
explicit confirmation
typed confirmation for critical operations
reason
audit
```

---

# 33. Platform Administration UI

## PLATFORM-P0-19.1 — Dedicated Admin Layout

Recommended:

```text
┌─────────────────────────────────────────────────────┐
│ WonderArc Platform Administration       SUPERADMIN  │
├───────────────┬─────────────────────────────────────┤
│ Dashboard     │                                     │
│ Branding      │                                     │
│ Plans         │          Main Workspace             │
│ Entitlements  │                                     │
│ Modules       │                                     │
│ AI            │                                     │
│ Countries     │                                     │
│ Integrations  │                                     │
│ Policies      │                                     │
│ Operations    │                                     │
│ Audit         │                                     │
└───────────────┴─────────────────────────────────────┘
```

## PLATFORM-P0-19.2 — Global Impact Banner

For platform-wide changes:

```text
⚠ Platform-wide change
This configuration affects all customers using this feature.
```

## PLATFORM-P0-19.3 — Desktop Tables

Use tables/proto-tables for:

- plans
- features
- entitlements
- AI providers
- integrations
- audit records
- customers
- feature flags

## PLATFORM-P0-19.4 — Responsive Mobile

Use stacked cards and progressive disclosure on smaller screens.

## PLATFORM-P0-19.5 — Professional Layout Rule

Claude Code must always:

- plan page hierarchy before implementation
- use appropriate borders/dividers
- align actions deliberately
- avoid oversized or floating buttons
- provide editable row actions where applicable
- keep related fields grouped
- prevent overflow/overlap
- test desktop/tablet/mobile
- use tables on larger screens where tabular information is clearer

This is a **generic WonderArc UI rule** and should be added to the project's permanent generic development rules.

---

# 34. Platform Dashboard Recommended Layout

```text
Platform Administration

┌──────────────────────────────────────────────────────┐
│ Platform Health                                      │
│ ✓ Operational   AI ✓   Email ✓   WhatsApp ✓         │
├──────────────────────────────────────────────────────┤
│ Customers       Active Plans       MRR               │
│ 2,840            2,516              ₹XX              │
├──────────────────────────────────────────────────────┤
│ Platform Configuration                               │
│                                                      │
│ Plans                  3 Active                      │
│ Modules                5 Enabled                     │
│ AI Providers           3 Configured                  │
│ Country Packs          6 Enabled                     │
├──────────────────────────────────────────────────────┤
│ Attention Required                                   │
│                                                      │
│ ⚠ Gemini key expires soon                            │
│ ⚠ Pro AI budget at 82%                               │
│ ⚠ WhatsApp integration degraded                     │
├──────────────────────────────────────────────────────┤
│ Recent Changes                                       │
│ Pro entitlement updated — 12 min ago                 │
│ Discovery flag enabled — 1 hr ago                    │
└──────────────────────────────────────────────────────┘
```

---

# 35. P0 Acceptance Criteria

The P0 implementation is complete only when:

- `/platform` exists.
- Unauthorized users cannot access platform pages or mutations.
- SUPERADMIN exists as a platform-level role.
- Platform configuration is separated from tenant/business configuration.
- Free/Pro/Max plans can be configured.
- Module and feature entitlements can be configured per plan.
- Quantity limits can be configured.
- Central entitlement evaluation is used by customer modules.
- Global feature flags exist.
- AI providers and keys can be securely configured.
- AI routing and budget controls exist.
- Country/compliance packs can be enabled/configured.
- Global branding can be configured and previewed.
- Platform announcements/maintenance mode exist.
- Platform-wide changes show impact before publishing.
- High-risk changes require explicit confirmation.
- Platform audit records are immutable/append-oriented.
- Configuration history exists for critical settings.
- Desktop tables and responsive layouts are implemented.
- No secrets are exposed to browser/UI/logs.
- RLS/RBAC/licensing remain enforced.
- Existing customer data and module functionality continue to work.

---

# 36. P1 Acceptance Criteria

P1 is complete when:

- Business-level temporary entitlement overrides exist.
- Support tools exist with safe impersonation.
- Billing/pricing lifecycle is configurable.
- Platform API/webhook policies are configurable.
- System health and operational dashboards exist.
- Feature rollout/staged release exists.
- Legal/policy versioning exists.
- Additional platform roles can be introduced without architectural changes.
- Configuration export/import exists without exporting secrets.

---

# 37. Recommended Implementation Sequence

## P0 Phase 1 — Control Plane Foundation

```text
PLATFORM-P0-01  SUPERADMIN
PLATFORM-P0-02  Dashboard
PLATFORM-P0-16  Audit
PLATFORM-P0-18  Security
```

## P0 Phase 2 — Commercial Configuration

```text
PLATFORM-P0-04  Plans
PLATFORM-P0-05  Entitlements
PLATFORM-P0-06  Usage/Limits
PLATFORM-P0-07  Modules
PLATFORM-P0-08  Feature Flags
```

## P0 Phase 3 — Platform Services

```text
PLATFORM-P0-09  AI
PLATFORM-P0-10  AI Cost/Safety
PLATFORM-P0-11  Email
PLATFORM-P0-12  Integrations
PLATFORM-P0-13  Country Packs
```

## P0 Phase 4 — Platform Experience

```text
PLATFORM-P0-03  Branding
PLATFORM-P0-14  Policies
PLATFORM-P0-15  Announcements
PLATFORM-P0-17  Configuration Versioning
PLATFORM-P0-19  Admin UI
```

---

# 38. P1 Sequence

```text
PLATFORM-P1-01  Config Import/Export
PLATFORM-P1-02  Business Overrides
PLATFORM-P1-03  Support Tools
PLATFORM-P1-04  Subscription Lifecycle
PLATFORM-P1-05  Platform Billing
PLATFORM-P1-06  Platform API Administration
PLATFORM-P1-07  Observability
PLATFORM-P1-08  Release Management
PLATFORM-P1-09  Legal/Policy Management
```

---

# 39. Separate Platform Branch

This work must be implemented in a dedicated Git branch:

```text
feature/platform-admin-portal
```

Do not implement these changes directly on the normal feature branch/main branch.

Recommended workflow:

```text
main
  │
  └── feature/platform-admin-portal
          │
          ├── P0 foundation
          ├── P0 plans/entitlements
          ├── P0 AI/configuration
          ├── P0 audit/security
          └── P1
```

Claude Code should:

1. Verify the current branch and clean/understand the working tree.
2. Create or switch to `feature/platform-admin-portal`.
3. Inspect the existing Core, module registry, licensing and authentication implementation.
4. Reuse existing platform capabilities rather than creating parallel mechanisms.
5. Implement one story at a time.
6. Test the story.
7. Commit the story.
8. Stop and wait for the next story.
9. Never merge into `main` unless explicitly instructed.

Suggested commit pattern:

```text
platform: add superadmin foundation
platform: add plan entitlement model
platform: add feature flag service
platform: add secure ai provider configuration
platform: add platform audit
```

---

# 40. Architectural Constraints for Claude Code

The following are mandatory:

### Do not

- put platform configuration into customer business tables
- expose SUPERADMIN through ordinary customer RBAC
- rely on frontend authorization
- duplicate the existing entitlement/licensing mechanism
- expose AI keys to the browser
- hard-code Free/Pro/Max limits in components
- hard-code country tax rules into platform UI
- silently change global configuration
- delete historical plans/configurations
- allow unaudited platform mutations
- create a second user/identity system
- create microservices merely for the admin portal

### Do

- use the existing monorepo architecture
- create platform-owned contracts
- use server-side authorization
- use RLS where applicable
- version important configuration
- audit every mutation
- reuse Core domain events where appropriate
- make configuration data-driven
- use adapter interfaces for external providers
- design rollback/recovery for high-risk settings
- preserve tenant isolation
- keep platform and customer administration visually distinct

---

# 41. Future Platform Capabilities — Not P0/P1

Potential later capabilities:

```text
Tenant health scoring
Automated abuse detection
Global usage analytics
Revenue analytics
Advanced billing engine
Marketplace/app management
Developer portal
Public API management
Partner/reseller management
White-label administration
A/B testing
AI model evaluation center
Prompt/version management
Global workflow automation
Data residency controls
Enterprise SSO configuration
SCIM provisioning
Advanced security center
```

These should not block P0/P1.

---

# 42. Final Product Definition

The Platform Administration Portal should become WonderArc's **central control plane**:

```text
                    WONDERARC PLATFORM
                           │
        ┌──────────────────┼──────────────────┐
        ↓                  ↓                  ↓
     COMMERCE           PRODUCT            OPERATIONS
        │                  │                  │
     Plans             Modules             Health
     Billing           Features            Integrations
     Entitlements      Limits              Maintenance
        │                  │                  │
        └──────────────────┼──────────────────┘
                           ↓
                    PLATFORM SERVICES
                           │
             ┌─────────────┼─────────────┐
             ↓             ↓             ↓
            AI          Compliance      Security
          Providers       Packs          Policies
             │             │             │
             └─────────────┼─────────────┘
                           ↓
                      ALL CUSTOMERS
```

The central principle is:

> **One platform control plane, one source of truth for global configuration, strict SUPERADMIN governance, versioned changes, and zero leakage between platform administration and customer administration.**
