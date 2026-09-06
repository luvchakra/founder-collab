# Platform design reference

`docs/design/reference-mockup.png` is the authoritative visual spec for the platform
shell (`CLAUDE.md` non-negotiable #7). It supersedes both vendored defaults:
`packages/core/src/components/ui/*`'s shadcn primitives came from `stockpilot-ai-ops`'s
teal/amber theme (`P-0`), and `co-founder-ai`'s own current CSS is a dark-violet theme —
neither is what the platform actually looks like. This file is the reference; every
module's screens share it.

## What the mockup shows

Six panels of one consistent admin shell, using inventory-module content (Dashboard,
Inventory list, Create Sales Order wizard, Invoice view, Reports, Business Settings) to
demonstrate the design, branded "CoFounderAI" (not "StockPilot") throughout.

**Shell layout, present in every panel:**
- Left sidebar, fixed width, white/near-white background: `CoFounderAI` wordmark + a
  small blue app-icon top-left; a vertical nav list below (icon + label per item); active
  item gets a light-blue pill background with the icon/label in the primary blue; a
  "Businesses" section pinned near the bottom shows the current business name in a
  bordered row and a "+ Create new business" link below it.
- Top bar, white background, border-bottom: a rounded search input ("Search anything...")
  on the left, a notification bell icon and the user's avatar (photo, circular) + name +
  email stacked to the right.
- Main content area: soft gray-blue page background (`--background`), content sits in
  white rounded cards (`--card`) with a subtle border, generous padding, `rounded-lg`
  corners throughout (cards, inputs, buttons — nothing sharp-cornered, nothing as
  rounded as a pill except the active-nav-item highlight and status badges).

**Color language:**
- Primary/accent: a clean mid blue (buttons, active nav state, links, the sales line in
  charts, primary numbers). Not StockPilot's teal, not `co-founder-ai`'s violet.
  `--primary` in `packages/core/src/ui-theme.css` is tuned to this.
- Status color coding used consistently: green for positive/in-stock/paid, amber for
  low-stock/pending, red for out-of-stock/overdue — small pill badges (`rounded-full`,
  colored background + colored text, no border).
- Page background is a barely-tinted gray-blue, distinct from the pure-white cards on it
  — this separation (page bg vs. card bg) is what makes the dashboard read as organized
  panels rather than one flat surface.

**Typography and density:** a single sans-serif family throughout (no separate display
font for headings, unlike StockPilot's Space Grotesk/DM Sans split) — headings are the
same family as body text, just heavier. Tables are dense (compact row height, small
text) — this is a data-heavy back-office tool, not a marketing page.

**Components the mockup implies we need, beyond what's built so far:**
- A sidebar shell driven by `moduleRegistry` (nav items already exist per `P-3`; the
  visual chrome — active-state pill, icon rendering, the wordmark, the business-switcher
  section — does not yet).
- A topbar with search + notifications + user menu.
- A business switcher (real data + switching logic is Epic 2's `C-5`; the mockup only
  fixes what it should *look* like).
- A stat-tile / KPI-card pattern (the four cards on the Dashboard panel).
- A multi-step wizard pattern (Create Sales Order's numbered 1-2-3 stepper).
- A print-optimized document view (the Invoice panel; `packages/core/src/ui-theme.css`
  already carries StockPilot's `.print-area`/`.label-sheet` utilities for this from
  `P-0` — kept deliberately, since printing invoices/labels is brand-neutral mechanism,
  not StockPilot's specific colors).

## What's implemented against this spec so far

- `packages/core/src/ui-theme.css`: full re-theme to the light/blue palette above
  (`P-3` follow-up, see `docs/PORT-PROVENANCE.md`).
- `apps/web`'s shell (sidebar + topbar) renders from `moduleRegistry`, with placeholder
  business/user data until Epic 2 wires real tenancy — see the shell components under
  `packages/core/src/components/shell/`.

Everything else in the mockup (KPI cards, the sales-order wizard, the invoice document
view, GST-specific screens) belongs to the stories that actually build those screens
(`SP-7`, `F-*`) — this file documents the shell and the design *language*, not a
commitment to build every panel now.
