import { getPlatformBranding } from "@cofounderai/core/admin/platform-branding";
import { BrandingForm } from "./branding-form";

/**
 * PLATFORM-P0-03.1: "WonderArc Branding" (docs/plan/09-PLATFORM-ADMIN-PORTAL-BACKLOG.md
 * §7) -- configure Platform Name, Logo, Favicon, Primary/Secondary/Accent colors, Login
 * Branding, Email Branding, Footer, and Support Contact, all backed by the single
 * `platform.branding` row.
 *
 * Deliberately NOT built here, left to their own later sub-stories in this same section:
 * a draft/preview/publish workflow (03.5 -- a save here takes effect immediately, same as
 * any other plain settings form in this codebase today), non-color design tokens like
 * radius/font/spacing (03.2), and the fuller login-page treatment -- background image
 * and legal links (03.3). This story also does not wire these values into the live
 * customer-facing app chrome/login page/email templates yet: the customer app's actual
 * visual theme is locked to the reference mockup in docs/DESIGN.md
 * (CLAUDE.md non-negotiable #7), and no email-sending system exists yet
 * (PLATFORM-P0-11) -- this page is the configuration source of truth; live consumption is
 * each of those future surfaces' own concern to wire up once they exist.
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
