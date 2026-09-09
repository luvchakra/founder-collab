# UI/UX Uniformity, Settings Controls, Beautification & Responsive Design

Companion to `UX-AUDIT.md`, not a replacement — nothing below repeats that file's
findings (destructive-action confirmation, toast, pending-state consistency,
route-loading states, global search, breadcrumbs, skeleton loaders, topbar-vs-spec,
accessibility labeling, `crm`'s pattern adoption, sidebar rebuild churn). This file
covers four different, newly-investigated angles: cross-module **uniformity**, a
proposed **settings control panel**, **beautification**, and **responsive design**
depth beyond the audit's headline percentage.

## 1. Uniformity — modules formatting the same data differently

**1a. Currency formatting disagrees with itself platform-wide. (P0)**
`packages/core/src/lib/format.ts` exports a shared `inr` formatter
(`maximumFractionDigits: 0` — whole rupees, e.g. "₹1,234"). At least 9 components in
`module-inventory` and `module-gst` (`sales-orders-list.tsx`, `so-detail.tsx`,
`po-detail.tsx`, `purchase-orders-list.tsx`, `invoices-list.tsx`,
`invoice-detail.tsx`, `return-form.tsx`, `gst-filing-view.tsx`) each independently
declare their own `Intl.NumberFormat("en-IN", { ..., maximumFractionDigits: 2 })` —
same currency, **different precision** ("₹1,234" in one screen, "₹1,234.00" in the
next, for what should be the identical convention). *Fix:* delete the local
formatters, import `inr` from `core/lib/format`; if 2-decimal precision is actually
needed for money (arguably correct for invoices/GST, arguably wrong for the shared
`inr`), that's a real product decision — pick one, then there's a single formatter
either way, not eight independent guesses.

**1b. Date formatting disagrees with itself the same way. (P0)**
Shared `formatDate` in the same file uses `day: "2-digit"` (e.g. "05 Jan 2026"). At
least 6 components (`gst-filing-view.tsx`, `sales-orders-list.tsx`,
`purchase-orders-list.tsx`, `invoices-list.tsx`, `invoice-detail.tsx`,
`returns-list.tsx`, `transfers-list.tsx`) use `day: "numeric"` instead ("5 Jan
2026") — a visible inconsistency between adjacent screens in the same module.
`schedule-calendar.tsx` (fsm) and `customer-center-view.tsx` (fsm) each build a
third, different options object from scratch. *Fix:* same as 1a — one shared
formatter, called everywhere, not independently reinvented per component.

**1c. No shared empty-state component, so visual treatment varies by module.**
Every list/table writes its own empty message inline ("No prospects yet." / "No
invoices yet." / "No completed jobs yet.") — fine as copy, but each is a bespoke
`<p>` with its own spacing/icon choice (or no icon), rather than one
`<EmptyState icon title description action />` primitive. *Fix:* add one to
`packages/core/src/components/ui/`, migrate call sites incrementally — this also
gives beautification item 2b (below) a single place to fix once instead of ~15.

**1d. Three hardcoded hex colors bypass the design-token system.**
`packages/core/src/components/ui/chart.tsx`, `module-fsm/.../signature-pad.tsx`,
and `module-discovery/.../fsm-handoff-panel.tsx` use literal hex values instead of
the CSS variables `DESIGN.md` specifies. Small in count, but exactly the kind of
thing that silently breaks dark-mode/theme consistency in just those three spots
while everything else respects the token system correctly.

**1e. Stale product name in the Appearance settings page itself.**
`settings/appearance/page.tsx`'s copy reads "Choose how **co-founder-ai** looks on
this device" — the pre-port product name, not the platform's actual name. Small,
but it's the literal first thing this audit's own settings-panel proposal (§2) would
sit next to, so worth fixing in the same pass.

## 2. Settings — a real "UI/UX control parameters" panel

Today `settings/appearance` is a single theme toggle in a plain card — the only
UI-behavior control in the entire platform. Given §1a/1b's formatting drift is
partly a "there's no single place to control this" problem, proposing an actual
panel here kills two birds: it gives users real control, and it gives the platform
one canonical place these preferences are read from instead of scattered
per-component assumptions (`en-IN` is hardcoded in every formatter call site found
above — nothing reads a user preference today).

**Proposed sections for an expanded Appearance/Display settings page:**

- **Theme** (existing) — light / dark / system.
- **Density** — comfortable (current default) / compact, adjusting table row height
  and card padding platform-wide. `DESIGN.md` already specifies dense tables as the
  intended look; compact mode makes that a choice rather than the only option, which
  matters once `fsm`/`inventory`'s longer lists get real production volume.
- **Date & number format** — locale selector (default `en-IN`, matching current
  hardcoded behavior) feeding directly into `core/lib/format.ts`'s formatters,
  closing the gap that caused §1a/1b: one setting, one source of truth, no per-file
  reimplementation possible once the shared functions read from it.
- **Reduce motion** — respects/overrides `prefers-reduced-motion`; relevant once any
  of the audit's animation-adjacent items (route-transition loading bar, sidebar
  collapse) actually ship motion.
- **Sidebar default state** — expanded / collapsed on load, persisted per user
  rather than always starting collapsed (current hardcoded default in
  `sidebar-context.tsx`).
- **Default landing module** — which module's dashboard opens after login, for
  accounts that live mostly in one module (e.g. an FSM-only business shouldn't land
  on the discovery-oriented account dashboard every time).

This is naturally a `core`-owned settings page (parallel to `ai-provider`/`billing`),
storing preferences in a new small `core.user_preferences` table (one row per user,
not per business — these are personal display preferences, not tenant data) — keep
it out of `core.businesses`/`licenses` entirely so it never needs RLS beyond
"user reads/writes their own row."

## 3. Beautification

**3a. Consistent iconography weight/size for table row actions.**
Only 12 uses of the `size="icon"` button variant exist platform-wide despite dense,
icon-heavy action rows being the norm per `DESIGN.md`'s own table spec — worth an
audit of whether row-action icon buttons are consistently sized via that variant or
each hand-styled with ad hoc padding, which would explain any visual unevenness
between, say, an inventory row's actions and an fsm row's actions.

**3b. Status badges — confirm one color mapping, not one per module.**
Every module has status enums that map conceptually to the same three ideas
(pending/in-progress/done, or open/closed, or draft/approved/sent) — worth a single
documented mapping (e.g. amber = pending-type states, blue = in-progress, green =
done/success, red = failed/cancelled/void) applied identically whether it's an FSM
job status, a GST filing status, an inventory PO status, or a CRM ticket status, so
a user working across modules pattern-matches color to meaning once, not per module.

**3c. Card/section header rhythm.**
Worth a pass confirming every module's page headers (title + one-line description +
primary action button, the pattern seen in nearly every `page.tsx` read during this
and prior sessions) use identical spacing/type scale — this is likely already close
given the shared `page.tsx` patterns observed, but hasn't been visually confirmed
across all 5 modules side by side the way `UX-AUDIT.md` TC-SHELL-008 calls for.

## 4. Responsive design — mobile, tablet, desktop

Beyond `UX-AUDIT.md`'s headline stat (22-32% of files per module use any responsive
class), here's where that actually bites and what to do about each:

**4a. Dense tables have no mobile fallback, only horizontal scroll.**
31 components render a `<Table>`; 38 files use `overflow-x-auto`/`overflow-auto`
(a reasonable existing baseline — most tables are at least horizontally scrollable
rather than broken). But an 8-column table (confirmed column count on
`sales-orders-list.tsx`, `purchase-orders-list.tsx`) squeezed into a phone width via
horizontal scroll is technically functional and genuinely unpleasant to use.
*Suggestion:* below a breakpoint (e.g. `md`), switch the densest transactional lists
(inventory sales orders/invoices/purchase orders, fsm jobs/invoices) to a stacked
card layout — one card per row, label/value pairs instead of columns — rather than
relying on scroll for the platform's most-used lists.

**4b. Sidebar behavior at tablet width specifically (not just mobile vs. desktop).**
The audit's responsive-class count treats "responsive" as binary; tablet (roughly
768-1024px) is its own case worth checking explicitly: does the sidebar stay a
full-width drawer (fine on phone, wasteful on a tablet that has room for persistent
nav), or does it get an intermediate collapsed-icon-rail state? Worth an explicit
tablet-width pass rather than assuming the mobile fix and the desktop layout cover
the middle case adequately.

**4c. Touch target sizing for icon-only actions.**
Ties to 3a — if row-action icon buttons aren't consistently using the `size="icon"`
variant (which has a defined min touch-target size), some may render below the
~44px touch-target guideline on a real phone/tablet even though they look fine with
a mouse cursor on desktop. Worth confirming against real device testing, not just
browser dev-tools width simulation, since hover-vs-tap affordance differs.

**4d. Forms with side-by-side fields need an explicit stacking check.**
Multi-field forms (invoice/estimate line-item rows, the GST profile form, PO/SO line
editors) commonly lay fields out horizontally on desktop; each should be verified to
stack to one field per row below `sm`/`md` rather than shrinking fields to
illegibility to preserve the horizontal layout — a common failure mode distinct from
"has no responsive classes at all."

**4e. `fsm`'s field-execution and "My Day" screens are the highest-priority mobile
target, not a generic "make everything responsive" effort.**
These are explicitly the module's own field-technician-on-a-phone screens (per the
registry's own `Smartphone` icon choice for "My Day") — if platform time for a
responsive pass is limited, this is where it matters most concretely, ahead of
back-office screens (settings, reports) more likely to be used at a desk.

## Suggested order for Claude Code

§1a/1b (formatting uniformity) first — small, mechanical, and directly unblocks a
correct §2 (the settings panel needs one source of truth to control, which fixing
1a/1b creates). Then §2 itself. §4a (card-view fallback for the densest tables) and
§4e (fsm mobile screens) are the highest-value responsive work; §3's beautification
items are lower urgency polish, reasonable to interleave with other module work
rather than block on.
