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
- `apps/web`'s shell (sidebar + topbar) renders from `moduleRegistry`, with real
  business/user data (Epic 2's tenancy landed) — see the shell components under
  `packages/core/src/components/shell/`.

Everything else in the mockup (KPI cards, the sales-order wizard, the invoice document
view, GST-specific screens) belongs to the stories that actually build those screens
(`SP-7`, `F-*`) — this file documents the shell and the design *language*, not a
commitment to build every panel now.

**Known, deliberate divergence from the mockup's shell layout (recorded 2026-09-09, not
a bug):** the mockup shows a persistently-visible left sidebar with the avatar/name/email
stacked in the topbar. What's actually built (`app-sidebar.tsx`) is a hamburger-toggled
overlay drawer (hidden by default, opened via `SidebarToggle` in the topbar, closes on
navigation/Escape/outside-click) — ported structurally from `co-founder-ai`'s own layout
rather than redrawn to the mockup's always-visible rail — and the account menu
(avatar/name/email + Profile/Usage/Billing/Settings/Log out) lives pinned to the bottom of
that drawer, not in the topbar, again matching `co-founder-ai`'s own convention (see
`app-topbar.tsx`'s and `sidebar-account-menu.tsx`'s own doc comments). The topbar also has
no search input yet (tracked separately, `NEXT-ACTIVITIES.md` §6 item 7). Reconciling
either of these for real means changing how every page's content area is sized (pages
currently assume a topbar-height offset only, not a permanent left-rail width too) — a
layout change, not a component swap, and the sidebar/nav components have already been
rebuilt repeatedly (`NEXT-ACTIVITIES.md` §6 item 13) without a settled target. Flagged
here as a deliberate, documented gap needing a real decision before another rebuild,
rather than silently patched (e.g. moving just the avatar into the topbar while the rest
of the drawer-vs-rail mismatch remains would not actually bring the shell in line with the
mockup).

**Global search: decided deferred, not built (recorded 2026-09-09).** The mockup's topbar
search ("Search anything...") was never implemented; `command.tsx` (cmdk) is vendored in
`packages/core/src/components/ui/` and unused. `NEXT-ACTIVITIES.md` §6 item 7 asked for an
explicit decision rather than leaving it ambiguous: real cross-module search would need to
query `core.parties`, `core.documents`, and each module's own RLS-scoped, license-gated
entities (jobs, invoices, tickets, products...) in one unified result set — a genuine new
feature spanning every module's own schema, not a component wiring exercise, and
speculatively building it now (before any story actually asks for it) is exactly what
CLAUDE.md principle 7 rules out. Decision: leave `command.tsx` vendored-but-unused until a
real story specs what "search anything" should actually search and how licensing/RLS
scope it; don't build a placeholder in the meantime.
