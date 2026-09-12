import { getPlatformBranding, getPlatformBrandingDraft } from "@cofounderai/core/admin/platform-branding";
import { formatDateTime } from "@cofounderai/core/lib/format";
import { BrandingForm } from "./branding-form";
import { PublishControls } from "./publish-controls";

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
 * PLATFORM-P0-03.5 ("Preview Before Publish") is now built: saving this form
 * (`saveBrandingDraft()`) no longer takes effect immediately -- it writes an unpublished
 * draft. `getPlatformBrandingDraft()` decides what the form pre-fills with (the draft if
 * one is pending, otherwise the live published values), and `PublishControls` below
 * surfaces the draft banner with links to Preview (`/platform/branding/preview`) and the
 * Publish/Discard actions. `getPlatformBranding()` is still read here too, only for the
 * "Last published" caption -- a separate, narrower use from the pre-fill values.
 *
 * Deliberately NOT built here, left to their own later sub-stories: non-color design
 * tokens like radius/font/spacing (03.2, deferred -- conflicts with the locked
 * dashboard-shell design system), and a fully dynamic legal-link list (PLATFORM-P1-09.3 --
 * this story scopes "legal links" to Terms + Privacy, the two virtually every login screen
 * shows). This page also still does not wire the primary/secondary/accent colors or
 * email-from-name into any live surface: the dashboard shell's colors are locked to
 * docs/DESIGN.md, and no email-sending system exists yet (PLATFORM-P0-11).
 */
export default async function PlatformBrandingPage() {
  const [branding, draft] = await Promise.all([getPlatformBranding(), getPlatformBrandingDraft()]);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">WonderArc Branding</h1>
        <p className="text-sm text-zinc-400">
          Platform-wide identity, colors, and contact details used across every WonderArc
          customer -- not a business&apos;s own branding.
        </p>
        <p className="mt-1 text-xs text-zinc-500">Last published {formatDateTime(branding.updatedAt)}.</p>
      </div>
      <PublishControls hasDraft={draft.hasDraft} draftUpdatedAt={draft.draftUpdatedAt} showPreviewLink />
      <BrandingForm values={draft.values} />
    </div>
  );
}
