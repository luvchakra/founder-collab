# WonderArk User Guides

End-user and admin documentation for the WonderArk platform: one account, one
login, five independently licensed modules. These guides are written for
business owners, admins, and day-to-day users of a WonderArk deployment — not
for developers working on the codebase (that's `docs/plan/` and `docs/design/`).

Start here if you're new to the platform:

- **[00 — Getting Started](./00-getting-started.md)** — signing up, creating
  your first business, understanding businesses vs. offerings, licensing
  modules, plans and billing, users, roles and invitations, API keys,
  exporting your data, and the environment variables an operator needs to
  configure before go-live.

Then the module guides, each covering the screens a user works in day to day
and the configuration a business admin must complete before the module is
usable:

- **[01 — Discovery](./01-discovery.md)** — customer acquisition (ICPs,
  AI-powered prospecting, opportunity intelligence), Marketing, and Funding.
- **[02 — Inventory](./02-inventory.md)** — product catalog, purchasing,
  sales orders, warehouses, and stock control.
- **[03 — Service (FSM)](./03-service-fsm.md)** — field service jobs,
  scheduling, crew dispatch, and invoicing.
- **[04 — CRM](./04-crm.md)** — leads, opportunities, the unified inbox,
  WhatsApp/Instagram/Facebook/Google Business channels, and reputation.
- **[05 — Finance](./05-finance.md)** — activation and backfill, the
  double-entry ledger, banking with reconciliation and bank rules, invoices,
  receivables and payables, financial statements with drill-down (including
  cash flow), operational reports, dimensions, and tax registration and
  filing prep (India GST, EU VAT, US sales tax).

## A note on module names vs. URLs

Two modules were renamed in the product UI after their underlying schema and
package names were already locked in:

| You see in the sidebar | Lives at this URL | Internal module key |
|---|---|---|
| Service | `/service` | `fsm` |
| Finance | `/finance` | `gst` |

Old links (`/fsm/...`, `/gst/...`, `/compliance/...`) still work — they
redirect automatically — but new links and bookmarks should use `/service`
and `/finance`.

## Licensing and degraded mode

Every module can be licensed independently per business. If a module isn't
licensed, its screens simply don't appear — and any other module that would
normally show data from it (e.g. CRM showing a customer's Inventory order
history) just omits that section rather than showing an error. Nothing in
this platform hard-depends on another module being active.
