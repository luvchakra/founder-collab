# Data protection: GDPR + India's DPDP Act 2023

Implemented in `supabase/migrations/20260908120000_core_privacy.sql` (+
`20260908121000_discovery_privacy_erasure.sql`) and `packages/core/src/privacy/*`; proven
by `scripts/test-core-privacy.mjs` and `privacy/privacy.test.ts`.

## Roles

- **Platform users' own data** (accounts, profiles, consents, security logs): the platform
  operator is the **controller / Data Fiduciary**.
- **Data a business stores about its customers, suppliers and prospects**: that business is
  the controller/fiduciary; the platform is its **processor**. The platform gives it the
  tools to meet its own obligations (request register, erasure, suppression).

## Rights -> implementation

| Right | GDPR | DPDP | How |
|---|---|---|---|
| Notice | Arts. 13-14 | s.5 | `/privacy`, versioned (`PRIVACY_NOTICE_VERSION`); a version bump re-prompts every user at `/consent` before any further processing |
| Consent: specific, affirmative, provable, withdrawable as easily as given | Art. 7 | s.6 | Unticked checkboxes at signup; append-only `core.consent_records`; marketing toggle under Privacy & data; Google sign-ups gated at `/consent` |
| Access + portability | Arts. 15, 20 | s.11 | Self-service JSON download (`/dashboard/settings/privacy/export`) |
| Correction | Art. 16 | s.12 | Profile page; any other correction via a request |
| Erasure | Art. 17 | s.12 | Self-service account deletion; businesses erase third parties by email across core and every module (`privacy.subject_erased` event) |
| Restriction / objection | Arts. 18, 21 | s.6(4) | Request register; one-click unsubscribe on all outreach email (RFC 8058 headers + footer link); spam complaints and hard bounces auto-suppress |
| Grievance redressal | -- | s.13 | Request type `grievance`; Grievance Officer named on `/privacy` |
| Nomination | -- | s.14 | Request type `nomination` |
| Response deadline | Art. 12(3): 1 month | Rules: within 90 days | `due_at` = 30 days; overdue requests are flagged in the register |

**Erasure vs. legal retention.** A person who appears on tax invoices is *restricted*,
not erased: name, billing address and GSTIN stay on the record, and every other contact
channel is removed (GDPR Art. 17(3)(b); DPDP s.8(7)). Account deletion retains a
business with issued invoices, with every member removed so nobody can access it, for the
GST retention period. Every erasure suppresses the address so it can't be re-contacted.

## Retention schedule (`core.run_retention()`, daily via `/api/cron/maintenance`)

| Data | Kept for | Why |
|---|---|---|
| Account, profile, consents | Life of the account | Contract; consent evidence |
| Tax documents, payments, audit log | 8 years | CGST Act s.36 / Rule 56; SOX s.802 |
| Payment webhook payloads | 90 days | Dispute window; payloads contain payer PII |
| Rate-limit counters | 1 day | Abuse prevention only; hashed keys |
| Processed domain events | 1 year | Replay/debugging |
| Privacy requests | Raw email 30 days after closing; record 3 years | Accountability evidence (the hash is kept) |
| Suppressions | Indefinitely, hash only | Needed to keep honouring the opt-out |

## Record of processing (GDPR Art. 30)

| Activity | Data subjects | Categories | Purpose / basis | Recipients | Transfers |
|---|---|---|---|---|---|
| Accounts & auth | Users | Identity, contact, credentials (hashed), MFA | Contract | Supabase | India (ap-south-1) |
| Business operations (inventory, FSM, invoicing) | Users' customers, suppliers, staff | Identity, contact, address, GSTIN, transactions | Processor for the business | Supabase, Vercel | India; Vercel edge (global) |
| Prospecting & outreach (discovery) | Prospects' employees | Name, title, work email, LinkedIn, public company data | Processor for the business (its legitimate interest / consent) | AI provider (BYOK), Resend | US (SCCs) |
| Billing | Users | Subscription status, payment references | Contract, legal obligation | Stripe, Razorpay | US / India |
| Collections | Businesses' customers | Payer name, email, phone, amount | Processor for the business | Business's own Stripe/Razorpay | Per provider |
| Security & audit | Users | Actions, hashed IPs | Legitimate interest, legal obligation | Supabase | India |

## Breach runbook

1. Contain, and preserve evidence (anchor the audit chain heads now; see the SOX doc).
2. Within **72 hours**: notify the lead EU supervisory authority if EU residents are
   affected (GDPR Art. 33). Notify the **Data Protection Board of India** and **CERT-In**
   (within 6 hours under the CERT-In 2022 directions) for Indian data; the DPDP Rules require a
   detailed report to the Board within 72 hours.
3. Notify affected individuals without undue delay (GDPR Art. 34; DPDP s.8(6)).
4. For a business's own data (platform as processor), notify that business without undue
   delay so it can meet its own obligations.

## Required configuration / organizational steps

- Fill in `PRIVACY_CONTROLLER_*` and `GRIEVANCE_OFFICER_*`, and have counsel review `/privacy`.
- Sign DPAs with Supabase, Vercel, Resend, Stripe and Razorpay; the AI provider is the user's own (BYOK).
- Platform-level requests (`business_id IS NULL` in `core.data_subject_requests`) are
  handled by platform staff with service-role access. Monitor that queue against `due_at`.
- Schedule `/api/cron/drain-events` (erasure propagates through it) and `/api/cron/maintenance`.
