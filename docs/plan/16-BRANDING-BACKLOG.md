<!--
Copied verbatim from the WonderArk Branding Implementation Specification supplied on
2026-09-26, with §31a (a machine-readable story index) and §36 (implementation notes)
appended. The approved brand board is `brand/wonderark-brand-board.png` -- the single
master every logo asset is cut from (scripts/build-brand-assets.mjs).
-->

# WonderArk — Branding Implementation Specification

## Purpose

Implement the approved WonderArk branding across the entire application, staying very close to the attached approved branding board.

The approved identity is:

- Minimal
- Modern
- Professional
- Enterprise-ready
- Trustworthy
- Clean
- Deep navy + blue + cyan
- Subtle blue/cyan gradient
- Stylized `W` as the primary mark
- **Small triangular wedge beneath the center of the W**
- Tagline: **BUSINESS IN ONE PLACE**

Do not introduce boats, waves, anchors, water, Noah/Ark illustrations, nautical imagery, or decorative alternatives.

---

## 1. Non-negotiable logo rule

The approved W mark consists of:

1. A continuous/ribbon-like stylized W.
2. Blue/cyan gradient treatment.
3. The distinctive lower central opening.
4. **The small triangular wedge below/inside that opening.**

The wedge is part of the logo identity.

It MUST appear consistently in:

- Primary logo
- Dark-background logo
- Horizontal logo
- Standalone mark
- App icon
- Mobile icon
- Favicon
- PWA icon
- Login/signup
- Loading/splash
- Email header
- Notification icon
- Browser tab
- Branded documents where applicable

Never create a W-only replacement.

Never remove the wedge at small sizes.

Never redraw the wedge differently for different surfaces.

Use one canonical SVG geometry everywhere.

---

# 2. Approved logo lockups

### Primary light

```text
       [ W + wedge ]

        WonderArk
   BUSINESS IN ONE PLACE
```

- `Wonder` = deep navy
- `Ark` = brand blue
- W = blue/cyan gradient
- Tagline = muted blue-gray
- White/light background

### Primary dark

```text
       [ W + wedge ]

        WonderArk
   BUSINESS IN ONE PLACE
```

- Deep navy background
- `Wonder` = white
- `Ark` = blue
- W = blue/cyan gradient
- Tagline = muted light blue-gray

### Horizontal

```text
[ W + wedge ]  WonderArk
                BUSINESS IN ONE PLACE
```

### Mark only

```text
[ W + wedge ]
```

The mark-only version is the official compact identity.

---

# 3. Approved palette

Use the attached branding board as the visual source of truth.

Canonical tokens:

```css
--brand-navy: #0B1F3B;
--brand-blue: #007BFF;
--brand-cyan: #00D1FF;
--brand-light-blue: #5CDEFF;
--brand-cool-gray: #E5EAF2;
--brand-slate: #64748B;
--brand-dark: #0F172A;
--brand-white: #FFFFFF;
```

Normalize any invalid/typographical color notation from the presentation into valid CSS.

### Gradient

Use the logo gradient consistently:

```css
--brand-gradient:
  linear-gradient(
    135deg,
    #006EFF 0%,
    #007BFF 45%,
    #00D1FF 100%
  );
```

The gradient is primarily a logo/brand treatment. Do not turn every button, card or text element into a gradient.

---

# 4. Typography

Preferred family:

```text
Inter
```

Fallback:

```text
system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif
```

Use:

- Bold for major headings
- Semibold for section headings
- Regular for body
- Medium for metadata/labels

Use the canonical logo asset rather than recreating the WonderArk wordmark as live text wherever possible.

---

# 5. Existing UI integration

The current WonderArk application already has an established design system:

- Light theme
- Soft gray-blue background
- White cards
- Blue primary actions
- Semantic success/warning/destructive colors
- Existing sidebar/topbar
- Existing responsive behavior

This task is **branding alignment, not a UI redesign**.

Claude Code must:

- Reuse existing components.
- Reuse existing tokens where compatible.
- Add brand tokens rather than scattering hex values.
- Preserve current application behavior.
- Preserve current navigation.
- Preserve existing Discovery implementation.
- Avoid unrelated refactors.

---

# 6. Canonical assets

Create or consolidate into one branding location, preferably:

```text
public/branding/wonderark/
```

Required assets:

```text
logo-primary.svg
logo-primary-dark.svg
logo-horizontal.svg
mark.svg
mark-dark.svg
mark-white.svg
mark-mono.svg
favicon.svg
favicon-16.png
favicon-32.png
icon-192.png
icon-512.png
```

If an equivalent existing directory exists, reuse it rather than creating a competing asset structure.

### Critical requirement

All variants must use the **same underlying W + wedge geometry**.

Only:

- color
- background treatment
- lockup orientation
- scale

may change.

---

# 7. Reusable logo component

Create/reuse:

```tsx
<WonderArkLogo
  variant="primary"
  size="md"
/>
```

Supported variants:

```text
primary
dark
horizontal
mark
mark-dark
white
mono
```

Supported sizes:

```text
xs
sm
md
lg
xl
```

The component must reference canonical assets.

Do not embed a separately drawn W in individual pages.

---

# 8. Application shell

## Desktop sidebar

Use the approved dark navy identity.

Example:

```text
┌─────────────────────────────┐
│ [W+wedge] WonderArk         │
│                             │
│ Executive Dashboard         │
│                             │
│ Discovery                ˅  │
│   Overview                  │
│   Business                  │
│   Business Offerings        │
│   Marketing                 │
│   Customer Acquisition      │
│   Funding                   │
│                             │
│ Inventory                ›  │
│ Service                  ›  │
│ CRM                      ›  │
│ Finance                  ›  │
│                             │
│ ─────────────────────────── │
│ KC  Kunal Chakraborty       │
└─────────────────────────────┘
```

Do not change the information architecture as part of this task.

Use the correct dark logo variant and retain the wedge.

---

# 9. Mobile navigation

The mobile drawer should use the same logo.

```text
┌──────────────────────────┐
│ [W+wedge] WonderArk   ×  │
│                          │
│ Executive Dashboard      │
│                          │
│ Discovery             ˅  │
│   Overview               │
│   Business               │
│   Business Offerings     │
│   Marketing              │
│   Customer Acquisition   │
│   Funding                │
│                          │
│ Inventory             ›  │
│ Service               ›  │
│ CRM                   ›  │
│ Finance               ›  │
└──────────────────────────┘
```

Never use a different mobile W.

---

# 10. Topbar

Keep the existing topbar structure.

Use:

- white/light surface
- subtle border
- navy text
- restrained blue accents
- standard notification/message icons

Do not turn the entire topbar into a gradient.

---

# 11. Buttons

Primary:

```text
background: #007BFF
text: white
```

Secondary:

```text
background: white
border: #E5EAF2
text: #0F172A
```

Do not use the logo gradient as the default background for all primary buttons.

Semantic destructive/success/warning colors remain semantic and should not be replaced by brand blue.

---

# 12. Cards

Use:

```text
background: white
border: #E5EAF2
existing WonderArk radius
```

Use subtle shadows only where the current component system already calls for them.

Avoid:

- glassmorphism
- glowing cards
- decorative waves
- excessive gradients
- nautical decoration

---

# 13. Authentication

Update:

- Login
- Signup
- Forgot password
- Reset password
- Invitation acceptance

Preferred layout:

```text
          [ W + wedge ]

           WonderArk
      BUSINESS IN ONE PLACE

        Welcome back

        Email
        Password

        [ Sign in ]
```

Dark authentication:

- Deep navy background
- White `Wonder`
- Blue `Ark`
- Blue/cyan W
- Wedge preserved

---

# 14. Loading / splash

Use the standalone:

```text
[ W + wedge ]
```

Optionally:

```text
WonderArk
```

under it.

If animated, animate the complete mark as one object.

Do not animate the wedge separately.

---

# 15. Favicon

The favicon MUST contain:

```text
W + wedge
```

Never:

```text
W only
WA
WonderArk text
```

Provide:

```text
16x16
32x32
48x48
64x64
```

At 16px, verify that the wedge remains visually present.

---

# 16. PWA / application icons

Provide:

```text
192x192
512x512
maskable variants where required
```

Respect safe areas.

Do not let OS masking crop the wedge.

---

# 17. Browser metadata

Canonical platform title:

```text
WonderArk — Business in One Place
```

Page title pattern:

```text
{Page} | WonderArk
```

Examples:

```text
Discovery | WonderArk
Marketing | WonderArk
Customer Acquisition | WonderArk
Funding | WonderArk
Finance | WonderArk
```

Update:

- favicon
- manifest
- theme color
- description
- Open Graph image
- social metadata

Browser/theme color:

```text
#0B1F3B
```

---

# 18. Email branding

Transactional email header:

```text
[W + wedge] WonderArk
BUSINESS IN ONE PLACE
```

Use the same canonical logo asset.

Do not recreate the logo using HTML/CSS.

Footer should use restrained navy/slate styling.

Do not automatically overwrite business/customer branding in business-generated documents.

---

# 19. Documents and exports

Where WonderArk platform branding is appropriate, use the canonical logo.

Examples:

- Reports
- Analytics exports
- Platform PDFs
- Funding reports
- System-generated documents

Distinguish platform branding from tenant/business branding.

Do not add WonderArk branding to customer-owned documents merely because the file is processed by WonderArk.

---

# 20. Empty states

Use the W + wedge sparingly.

Example:

```text
        [ W + wedge ]

       No campaigns yet

Create your first marketing campaign
to start tracking performance.

       [Create Campaign]
```

Do not use oversized decorative logos.

---

# 21. AI surfaces

AI functionality should use WonderArk branding, not create a separate AI brand.

Acceptable:

```text
[small W+wedge]
WonderArk AI
```

Do not introduce a mascot or competing AI logo.

---

# 22. Discovery / Marketing / Customer Acquisition / Funding

All Discovery subareas must share the same WonderArk identity:

```text
Discovery
├── Overview
├── Business
├── Business Offerings
├── Marketing
├── Customer Acquisition
└── Funding
```

Do not give Marketing, Customer Acquisition or Funding independent brand colors or logo systems.

Functional module icons may remain different.

---

# 23. Module icons

Keep existing functional icons:

```text
Discovery → discovery icon
Inventory → cube
Service → wrench
CRM → CRM icon
Finance → finance icon
```

Do not replace every icon with a W.

WonderArk brand identity = W + wedge.

Module identity = functional icon.

---

# 24. App icon

Approved structure:

```text
┌───────────────────┐
│                   │
│        W          │
│       / \         │
│      wedge        │
│                   │
└───────────────────┘
```

Variants:

### Light

White/light background + blue/cyan W.

### Dark

Deep navy background + blue/cyan W.

### Blue

Blue background + white W + white wedge.

All variants retain the same geometry.

---

# 25. Monochrome

Provide:

- dark W + wedge
- white W + wedge
- gray W + wedge

Never remove the wedge in monochrome.

---

# 26. Logo clear space

Minimum recommended clear space:

```text
>= 0.25 × logo height
```

For mark-only:

```text
>= 0.20 × mark height
```

Never allow UI elements or container edges to collide with the mark.

---

# 27. Minimum size

Full logo:

```text
~120px minimum digital width
```

Horizontal:

```text
~140px minimum digital width
```

Standalone mark:

```text
~20px minimum
```

Favicon:

```text
16px
```

Test the 16px version carefully.

---

# 28. Prohibited logo modifications

Never:

- stretch
- squash
- rotate
- skew
- change W proportions
- change wedge geometry
- remove wedge
- replace wedge with a wave
- add waves
- add boat imagery
- add anchor imagery
- add water
- add Noah/ark imagery
- add clouds
- add unnecessary 3D
- add arbitrary glow
- add arbitrary shadows
- add text inside the W

The logo should remain minimal and professional.

---

# 29. Brand asset separation

Do not allow tenant business branding to replace WonderArk's platform identity in:

- platform navigation
- authentication
- platform billing
- system notifications
- platform error pages
- platform administration

Business branding can be used in business-owned documents and customer-facing material according to existing product rules.

---

# 30. Accessibility

Meaningful logo:

```html
alt="WonderArk"
```

Decorative repeated logo:

```html
alt=""
```

If a nearby text label already says WonderArk, the icon can be:

```html
aria-hidden="true"
```

Ensure sufficient contrast for:

- logo
- text
- active navigation
- dark mode
- light mode

---

# 31. Implementation stories

## BRAND-01 — Audit existing branding

Search for:

```text
logo
WonderArk
favicon
manifest
metadata
theme
brand
```

Map all current branding assets/usages before changing anything.

Acceptance:

- existing assets identified
- duplicated implementations identified
- canonical replacement plan created

## BRAND-02 — Brand tokens

Create central WonderArk tokens and map compatible existing UI tokens.

Acceptance:

- no new scattered brand hex values
- gradient centralized
- colors centralized

## BRAND-03 — Canonical assets

Create/consolidate:

- primary logo
- dark logo
- horizontal logo
- mark
- monochrome variants
- favicon
- PWA icons

Acceptance:

- all use identical W + wedge geometry

## BRAND-04 — Logo component

Create/reuse `WonderArkLogo`.

Acceptance:

- all variants use canonical assets
- responsive sizes
- accessible
- no duplicated SVG logo implementations

## BRAND-05 — Application shell

Update:

- sidebar
- topbar
- mobile drawer
- authentication shell

Acceptance:

- approved branding
- wedge preserved
- current navigation unchanged

## BRAND-06 — Favicon / PWA

Update:

- favicon
- Apple icon
- manifest
- maskable icons
- theme color

Acceptance:

- wedge present in all variants

## BRAND-07 — Metadata

Update titles, descriptions and social metadata.

## BRAND-08 — Authentication

Update login/signup/password/invitation screens.

## BRAND-09 — Existing component mapping

Validate:

- buttons
- cards
- inputs
- tabs
- tables
- badges
- dialogs
- empty states
- banners

Do not redesign functionality.

## BRAND-10 — Module validation

Validate:

- Discovery
- Marketing
- Customer Acquisition
- Funding
- Inventory
- Service
- CRM
- Finance

All must use the same WonderArk identity.

## BRAND-11 — Email/documents

Update existing templates with canonical assets where applicable.

## BRAND-12 — Visual QA

Test:

- desktop
- tablet
- mobile
- light mode
- dark mode
- login
- sidebar
- topbar
- Discovery
- Marketing
- Customer Acquisition
- Funding
- Inventory
- Service
- CRM
- Finance
- favicon
- app icon
- browser tab

---

# 32. Automated validation

Add appropriate tests for:

```text
WonderArkLogo variant rendering
canonical asset paths
favicon metadata
manifest icon paths
theme color
page metadata
```

Avoid brittle pixel-perfect automated tests.

Perform visual inspection for final logo consistency.

---

# 33. Claude Code implementation protocol

Before implementation:

1. Pull latest `main`.
2. Inspect current repository.
3. Read `CLAUDE.md`.
4. Read `docs/design/claude-ui-design-rules.md`.
5. Inspect existing branding assets and UI tokens.
6. Reuse existing components.
7. Do not change application information architecture.
8. Do not alter Discovery functionality.
9. Do not create a second logo system.
10. Do not remove the wedge.
11. Implement canonical assets first.
12. Implement the reusable logo component.
13. Apply branding incrementally.
14. Run tests/typecheck/lint/build.
15. Test desktop and mobile.
16. Update progress tracker.
17. Commit focused changes.
18. Push according to repository workflow.

---

# 34. Final acceptance checklist

## Logo

- [ ] W matches approved reference
- [ ] W has blue/cyan gradient
- [ ] lower central wedge is present
- [ ] wedge geometry is identical everywhere
- [ ] no waves
- [ ] no boat
- [ ] no nautical decoration
- [ ] no alternate W drawing

## Identity

- [ ] Deep Navy
- [ ] Bold Blue
- [ ] Bright Cyan
- [ ] Cool Gray
- [ ] Inter/system typography
- [ ] `BUSINESS IN ONE PLACE`

## Application

- [ ] Sidebar
- [ ] Topbar
- [ ] Mobile drawer
- [ ] Login
- [ ] Signup
- [ ] Loading
- [ ] Empty states
- [ ] Emails
- [ ] Metadata
- [ ] PWA
- [ ] Favicon

## Consistency

- [ ] One canonical W
- [ ] One canonical wedge
- [ ] One canonical gradient
- [ ] One canonical wordmark
- [ ] One canonical tagline
- [ ] No duplicate logo geometry

---

# 35. Final brand principle

WonderArk should communicate:

```text
Professional
+
Modern
+
Trustworthy
+
Simple
+
Intelligent
```

The identity should remain understated.

The meaning of "Ark" should be subtle and embedded in the W geometry. Do not explain it visually with boats, waves or nautical graphics.

## Most important implementation rule

> **Every WonderArk logo, mark, favicon, app icon and branded surface must use the same canonical W + wedge geometry. The wedge is part of the WonderArk logo, not an optional decoration.**

---

# 31a. Story index

Machine-readable index of §31's stories for `npm run build:progress`; code and tests cite
these ids (e.g. `BRAND-04`) as evidence of implementation. Brand board:
`brand/wonderark-brand-board.png`.

| Story | Title |
|---|---|
| `BRAND-01` | Audit existing branding |
| `BRAND-02` | Brand tokens |
| `BRAND-03` | Canonical assets |
| `BRAND-04` | Logo component |
| `BRAND-05` | Application shell |
| `BRAND-06` | Favicon / PWA |
| `BRAND-07` | Metadata |
| `BRAND-08` | Authentication |
| `BRAND-09` | Existing component mapping |
| `BRAND-10` | Module validation |
| `BRAND-11` | Email/documents |
| `BRAND-12` | Visual QA |

---

# 36. Implementation notes (2026-09-26)

Where the implementation deliberately departs from, or had to interpret, the text above.

- **BRAND-01 audit.** Before this work the platform served an older logo (a ribbon W with a
  swoosh and sparkle, tagline "Accelerate. Revenue. Knowledge.") from two raster masters,
  through `BRAND_LOCKUP` / `BRAND_MARK` and a `LogoMark` component used by the rail and
  the platform admin header; the navbar, footer and auth header used the lockup directly;
  `app/icon.png` / `app/apple-icon.png` were the tab and home-screen icons; titles read
  "WonderArk Platform" / "{Page} — WonderArk"; the font was Geist. All of it is replaced;
  `LogoMark` is deleted, so there is one logo component.
- **Assets are cut from the approved board, not redrawn** (product owner's direction:
  "use the attached images that I provided"). The board is raster, so the canonical
  assets are PNGs (`apps/web/public/brand/logo-*.png`), not the SVG filenames §6 lists;
  an SVG wrapping a bitmap is not a vector, and redrawing the W would break §1's "one
  canonical geometry". `favicon.svg` is therefore not provided; favicons are PNG at
  16/32/48/64.
- **Asset location.** §6 prefers `public/branding/wonderark/`; the existing brand directory
  `public/brand/` is reused instead, as §6 allows.
- **Extra variants.** Besides §7's list, `horizontal-dark`, `inline` / `inline-dark` (mark +
  wordmark, no tagline, for the 28px shell where a tagline is unreadable) and `gray`
  (§25's grey monochrome) exist. `mark-dark` means "the mark drawn for navy grounds".
- **Horizontal lockups are composed**, from the stacked panels' mark and wordmark, in the
  proportions measured from the board's own horizontal lockup: the stacked panels'
  artwork is roughly twice the resolution, and the board has no dark horizontal lockup.
- **Primary blue #007BFF on white is 3.98:1**, below WCAG AA's 4.5:1 for normal-size
  text. §11 specifies it for primary buttons and it is used as specified; blue *text* on
  light tints uses one darker step (#0062CC, 5.8:1) via `--primary-subtle` /
  `--accent-foreground`. Flagged for the product owner.
- **Auth screens** show the stacked lockup above the form (§13); the header carries only
  navigation, so no screen shows the logo twice. A superadmin's login-logo override
  (Platform portal → Branding) still wins, as before.
- **Emails.** Platform mail (invitations, access changes, billing) carries the email
  header image; a business's own mail to its customers is unchanged (§19).
- **Dark theme.** The rail, platform header and OG card use the navy-ground artwork; the
  logo component's `adaptive` mode swaps light/navy twins with the theme.
