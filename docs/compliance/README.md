# Compliance & payments

What this codebase does for payments (Razorpay, Stripe), data protection (GDPR, India's
DPDP Act 2023), financial-reporting controls (SOX-style ITGC/ICFR) and IT security --
and, just as important, what it **can't** do on its own.

| Document | Covers |
|---|---|
| [`payments.md`](payments.md) | Razorpay + Stripe: platform billing for module licenses, invoice collections for each business, webhooks, setup and runbook |
| [`gdpr-dpdp.md`](gdpr-dpdp.md) | Rights mapping, consent, register of requests, erasure, suppression, retention schedule, record of processing, breach runbook |
| [`sox-financial-controls.md`](sox-financial-controls.md) | Control matrix: audit trail, posting, period close, payment void, segregation of duties, access-change logging |
| [`security.md`](security.md) | Application security controls, plus the settings that live outside the repo |

## Code enforces it; your organization still has to certify it

Every control below is enforced in the database (RLS, triggers, `SECURITY DEFINER`
functions with explicit authorization) or in the request path, and each one has a test
that proves it bites (`npm run test:db`, `npm test`). Code doesn't make a company
compliant by itself, though. These remain organizational responsibilities:

- **SOX** applies to US-listed companies and their auditors' attestation. The controls
  here are the *technical* half (application controls + ITGCs); management still owns
  control design sign-off, periodic access reviews, change-management evidence and
  testing by internal audit.
- **GDPR/DPDP**: appointing a Grievance Officer (and DPO where required), signing DPAs
  with every processor listed in the privacy notice, keeping the record of processing
  current, legal review of the privacy notice wording, and running the breach
  notification process.
- **PCI DSS**: card data never touches this platform (Stripe Checkout / Razorpay hosted
  pages), which keeps it in SAQ-A scope. Completing the annual SAQ-A is still on you.
- **Configuration outside the repo**: see "Required configuration" in each document
  (Supabase Auth settings, Vercel cron schedules, GitHub branch protection, provider
  dashboards).
