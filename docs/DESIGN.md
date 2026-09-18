# Platform design reference

The `docs/design/reference-*.png` screens are the authoritative visual spec for the
platform shell (`CLAUDE.md` non-negotiable #7). It supersedes both vendored defaults:
`packages/core/src/components/ui/*`'s shadcn primitives came from `stockpilot-ai-ops`'s
teal/amber theme (`P-0`), and `co-founder-ai`'s own current CSS is a dark-violet theme —
neither is what the platform actually looks like. This file is the reference; every
module's screens share it.

**Which file is which.** `reference-shell-dashboard.png` and
`reference-shell-detail-screens.png` are the current desktop spec (dark rail, light
content); `reference-mobile-screens.png` and `reference-mobile-modules.png` are the same
system at phone width. `reference-mockup.png` is the earlier, light-sidebar mockup, kept
for provenance — where the two disagree (sidebar color, nav structure, KPI tiles), the
newer screens win.

**These are UI/UX references, not content.** The menus, labels, numbers and modules drawn
in them are illustrative. The platform's real navigation comes from `module-registry` and
its real copy from the product — never transcribe a label or a metric out of a reference
screen.

## What the reference shows

**Shell layout, present in every screen:**
- A persistent left rail, fixed width (`w-64`), on a **dark navy** surface that stays dark
  in both light and dark themes — it is the app's constant frame, not a surface that
  follows the page. Top to bottom: the wordmark + app icon; a bordered business-switcher
  card (current business name over a "Business" caption, chevron); the module list, where
  every module the account can see is listed at once and the current one is expanded to
  its own sub-navigation (active sub-item gets a solid blue pill, the rest are muted);
  an unlicensed module keeps its row and gets a padlock; below a divider, the
  account-level shortcuts; then an "AI Usage" meter and the account row (avatar, name,
  email) pinned to the bottom.
- The rail is permanent from `lg` up and the same rail as a slide-over drawer below it,
  where the topbar carries the hamburger toggle and the wordmark.
- Top bar, white, border-bottom, sitting beside the rail rather than above it — thin by
  design, since navigation, the business switcher and the account menu all live in the
  rail.
- Main content area: soft gray-blue page background (`--background`), content in white
  rounded cards (`--card`) with a subtle border and a near-flat shadow, generous padding,
  `rounded-lg`/`rounded-xl` corners throughout (cards, inputs, buttons — nothing
  sharp-cornered, nothing as rounded as a pill except the active-nav-item highlight and
  status badges).

**Color language:**
- Primary/accent: a clean mid blue (buttons, active nav state, links, the sales line in
  charts, primary numbers). Not StockPilot's teal, not `co-founder-ai`'s violet.
  `--primary` in `packages/core/src/ui-theme.css` is tuned to this.
- **One status color mapping platform-wide** (`UI-UX-UNIFORMITY.md` §3b) — blue for
  in-progress/informational, green for done/positive, amber for pending/needs-attention,
  red for failed/cancelled/overdue, gray for anything carrying no such meaning. Rendered
  as soft tinted pills (`rounded-full`, tinted background + a darker same-hue text token,
  no border) — never solid blocks. `packages/core/src/components/ui/status-badge.tsx`
  encodes the mapping once; a module with its own status enum maps onto those five ideas
  rather than re-deciding colors, so a user learns the code once and it holds across
  modules.
- The tinted-pill text uses the `--*-subtle` tokens, not the base status color: a
  `bg-success/12` pill with `text-success` on it fails contrast at badge size.
- Page background is a barely-tinted gray-blue, distinct from the pure-white cards on it
  — this separation (page bg vs. card bg) is what makes the dashboard read as organized
  panels rather than one flat surface.

**Typography and density:** a single sans-serif family throughout (no separate display
font for headings, unlike StockPilot's Space Grotesk/DM Sans split) — headings are the
same family as body text, just heavier. Tables are dense (compact row height, small
text) — this is a data-heavy back-office tool, not a marketing page.

## The shared components this system is made of

Three `packages/core/src/components/ui/` primitives carry the patterns that repeat on
every screen. A page uses these rather than hand-rolling the same markup — which is what
previously let the same metric or status read differently from one module to the next:

- **`page-header.tsx`** — the one page-header rhythm: optional breadcrumb trail, then the
  title with a one-line description on the left and that page's primary actions on the
  right, stacking on a phone.
- **`stat-card.tsx`** — the KPI tile: big number, label, optional trend (arrow + percent,
  green up / red down) and optional tinted icon chip. `href` makes the whole tile a link.
- **`status-badge.tsx`** — the status pill and the color mapping described above.

A print-optimized document view (invoices, label sheets) stays on
`packages/core/src/ui-theme.css`'s `.print-area`/`.label-sheet` utilities, kept from the
`P-0` vendor since printing is brand-neutral mechanism, not StockPilot's colors.

## What's implemented against this spec

- `packages/core/src/ui-theme.css`: the palette, the near-flat shadow scale and the
  `--*-subtle` status text tokens.
- The shell under `packages/core/src/components/shell/` — rail, topbar, business
  switcher, account menu — rendering from `moduleRegistry` with real business/user data.
- The three shared primitives above, adopted by the module dashboards that previously
  each declared their own KPI-card component.

Module screens beyond that (the sales-order wizard's stepper, GST-specific screens)
belong to the stories that actually build them — this file documents the shell and the
design *language*, not a commitment to build every panel now.

**Drawer-vs-rail: resolved (recorded 2026-09-17).** This file previously flagged a
deliberate divergence — the mockup showed a persistent rail, while what was built was a
hamburger-toggled overlay drawer ported from `co-founder-ai`, and it asked for a real
decision before another rebuild rather than a silent patch. The decision is the reference
screens above: the rail is **persistent from `lg` up** and the same rail is a drawer below
it, and the content column is offset by its width (`dashboard-shell.tsx`) instead of
assuming a topbar-height offset only. Two consequences worth knowing:

- The account menu stays pinned to the bottom of the rail (not moved into the topbar) —
  which is both `co-founder-ai`'s convention and what the newer reference screens show.
- Listing every module at once, with the current one expanded, replaced the previous
  one-module-at-a-time drawer and its module-picker popover. The module **pin** went with
  it: pinning existed to stop that single-module drawer following the URL, and with every
  module permanently listed it had nothing left to do. The rail still remembers the last
  section opened by hand (same `localStorage` key), which is the part of pinning that
  carried real intent.

**Global search: still deferred, not built (recorded 2026-09-09, reaffirmed
2026-09-17).** The reference topbar shows a search input ("Search anything...");
`command.tsx` (cmdk) is vendored in
`packages/core/src/components/ui/` and unused. `NEXT-ACTIVITIES.md` §6 item 7 asked for an
explicit decision rather than leaving it ambiguous: real cross-module search would need to
query `core.parties`, `core.documents`, and each module's own RLS-scoped, license-gated
entities (jobs, invoices, tickets, products...) in one unified result set — a genuine new
feature spanning every module's own schema, not a component wiring exercise, and
speculatively building it now (before any story actually asks for it) is exactly what
CLAUDE.md principle 7 rules out. Decision: leave `command.tsx` vendored-but-unused until a
real story specs what "search anything" should actually search and how licensing/RLS
scope it; don't build a placeholder in the meantime. The topbar is therefore thinner than
the reference screens show — deliberately, since a search box that looks real and does
nothing is worse than no search box.

## The logo, and which file goes where

The brand masters live in `brand/`: the full WonderArk lockup — mark, wordmark and the
"Accelerate. Revenue. Knowledge." tagline — drawn twice, once for a light ground and once
for a dark one. They are two pieces of artwork rather than one recoloured, because the
mark itself changes: the light version carries a navy underside on the W, the dark version
a white one. Neither survives being dropped on the other's background.

Everything the app serves is derived from those two files by `npm run build:brand`
(`scripts/build-brand-assets.mjs`). Nothing under `apps/web/public/brand/` or the icon
files in `apps/web/app/` should be edited by hand — replace a master and rebuild.

Components never name a file. They import `BRAND_LOCKUP` / `BRAND_MARK` from
`@cofounderai/core/brand/generated/assets`, which the same script writes: it carries both
the path and the intrinsic dimensions `next/image` needs to reserve space, and both are
facts about the files rather than numbers worth copying.

| Asset | What it is | Where it belongs |
|---|---|---|
| `BRAND_LOCKUP.onLight` | Mark + wordmark, navy artwork | Light surfaces: the marketing navbar and footer, the auth header |
| `BRAND_LOCKUP.onDark` | Mark + wordmark, white artwork | Dark surfaces |
| `BRAND_MARK.onLight` | The mark alone, navy artwork | Light surfaces, via `LogoMark` |
| `BRAND_MARK.onDark` | The mark alone, white artwork | Dark surfaces, via `LogoMark onDark` — the navigation rail and the platform admin header, which are dark in both themes |
| `app/icon.png` | The mark on brand navy, 512px | The browser tab |
| `app/apple-icon.png` | The same, 180px | The iOS home screen |
| `app/opengraph-image.png` | The lockup on brand navy, 1200×630 | Every link preview, Open Graph and Twitter alike |

Four decisions worth not re-litigating:

- **The in-app lockup has no tagline.** It renders at 28–32px tall everywhere it appears;
  keeping the strapline would shrink the wordmark to make room for four unreadable pixels.
  The footer sets the tagline as real text instead, where it can be read and selected.
- **Both variants of each asset are written at identical dimensions**, so the theme swap in
  `LogoMark` cannot shift the layout by the percent or two their natural crops differ by.
- **The icons are not transparent.** The mark carries navy in one variant and white in the
  other, so a transparent app icon loses part of itself against whichever browser chrome it
  lands on. A solid brand-navy ground is the one version that reads everywhere.
- **Every filename carries a content hash.** Replacing an image at a path it has already
  been served from is the one change a cache cannot see — Next's image optimizer keys on
  the URL and keeps handing out the old artwork for its minimum TTL. That is not
  theoretical: it happened while this pipeline was being built, with the optimizer serving
  a stale WebP of the previous logo for a URL whose PNG was already correct. New artwork is
  now a new URL, so there is nothing to invalidate.

The lockup files are the platform's *default*. A superadmin can override the login logo
with their own URL from the Platform portal's Branding page, and each business can set its
own logo for the business switcher — neither replaces these.
