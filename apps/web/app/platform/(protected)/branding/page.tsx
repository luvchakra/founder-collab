import { getPlatformBranding } from "@cofounderai/core/admin/platform-branding";
import { BrandingForm } from "./branding-form";

/**
 * PLATFORM-P0-03.1 + PLATFORM-P0-03.3 (docs/plan/09-PLATFORM-ADMIN-PORTAL-BACKLOG.md §7) --
 * configure Platform Name, Logo, Favicon, Primary/Secondary/Accent colors, Login Branding
 * (headline/support text/background treatment/legal links), Email Branding, Footer, and
 * Support Contact, all backed by the single `platform.branding` row.
 *
 * Unlike 03.1's own dashboard-shell/email fields (deliberately not wired into any live
 * surface yet -- see below), 03.3's login-page fields (logo, headline, support text,
 * background, terms/privacy links) ARE wired into the real, public
 * `apps/web/app/(auth)/layout.tsx` and `.../login/page.tsx` via
 * `getPublicLoginBranding()` -- unlike the dashboard shell (locked to docs/DESIGN.md per
 * CLAUDE.md non-negotiable #7), the pre-login auth pages' *content* has no such lock, and
 * every field defaults to null/the current copy, so an unconfigured platform renders
 * exactly as it did before this story.
 *
 * Deliberately NOT built here, left to their own later sub-stories: a draft/preview/publish
 * workflow (03.5 -- a save here takes effect immediately, same as any other plain settings
 * form in this codebase today), non-color design tokens like radius/font/spacing (03.2,
 * deferred -- conflicts with the locked dashboard-shell design system), and a fully dynamic
 * legal-link list (PLATFORM-P1-09.3 -- this story scopes "legal links" to Terms + Privacy,
 * the two virtually every login screen shows). This page also still does not wire the
 * primary/secondary/accent colors or email-from-name into any live surface: the dashboard
 * shell's colors are locked to docs/DESIGN.md, and no email-sending system exists yet
 * (PLATFORM-P0-11).
 */
export default async function PlatformBrandingPage() {
  const branding = await getPlatformBranding();

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">WonderArc Branding</h1>
        <p className="text-sm text-zinc-400">
          Platform-wide identity, colors, and contact details used across every WonderArc
          customer -- not a business&apos;s own branding.
        </p>
      </div>
      <BrandingForm branding={branding} />
    </div>
  );
}
