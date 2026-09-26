import Link from "next/link";
import { WonderArkLogo } from "@cofounderai/core/shell/wonderark-logo";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AuthTabs } from "@/components/auth/auth-tabs";
import { AuthInfoPanel } from "@/components/auth/auth-info-panel";
import { backgroundStyleFor } from "@/lib/login-branding";
import { getPublicLoginBranding } from "@cofounderai/core/admin/platform-branding";

// Prerendered and revalidated every five minutes rather than rendered per request. This
// used to be `force-dynamic` because the live `platform.branding` read below needs
// SUPABASE_SERVICE_ROLE_KEY, which a build without `.env.local` lacked -- but
// `getPublicLoginBranding()` has since learned to serve its documented defaults when the
// key or the row is missing, so a prerender can no longer fail on it. What that buys: the
// login screen, the first thing every returning founder loads, comes off the CDN instead
// of a 1-2 s cold function render, and a superadmin's branding change still shows within
// five minutes. Pages under here that genuinely read the request (reset-password reads
// the session) stay dynamic on their own; login reads its `?error=` in the browser
// (components/auth/login-error.tsx) precisely so it doesn't have to.
export const revalidate = 300;

/**
 * PLATFORM-P0-03.3 ("Platform Login Branding",
 * docs/plan/09-PLATFORM-ADMIN-PORTAL-BACKLOG.md §7): reads the platform-wide login
 * background/logo config and applies it here, since `(auth)/layout.tsx` wraps every auth
 * page (login, signup, forgot-password, reset-password) that shares this one background.
 *
 * Deliberately additive, not a redesign: `getPublicLoginBranding()`'s
 * `loginBackgroundStyle` defaults to `'gradient'` with a `null` value, which resolves to
 * `undefined` inline styles below -- i.e. the plain `bg-landing-bg` class keeps rendering
 * exactly as it always has until a superadmin actually sets an override. This preserves
 * `apps/web/app/globals.css`'s own `.landing-theme` tokens (the WonderArk brand, shared
 * with the marketing site) by default, while making it configurable, which is what this
 * story asks for -- not a conflict with that, since nothing changes unless a superadmin
 * opts in.
 *
 * PLATFORM-P0-03.5: `backgroundStyleFor()` moved to `@/lib/login-branding` so the new
 * branding preview page (`/platform/branding/preview`) can apply the exact same treatment
 * to a *draft* value without duplicating this logic.
 *
 * The published Platform Name also drives this page's own metadata and the logo's
 * accessible name below -- both previously hardcoded to the static `BRAND_NAME` constant
 * even though `branding.platformName` was already being fetched right here, so a
 * superadmin publishing a new Platform Name had no visible (or accessible) effect
 * anywhere on the one page group that already reads live branding.
 */
export async function generateMetadata(): Promise<Metadata> {
  const branding = await getPublicLoginBranding();
  return { title: { absolute: `${branding.platformName} — Business in One Place` } };
}

export default async function AuthLayout({ children }: { children: ReactNode }) {
  const branding = await getPublicLoginBranding();
  const backgroundStyle = backgroundStyleFor(branding.loginBackgroundStyle, branding.loginBackgroundValue);

  return (
    <div
      className="landing-theme flex min-h-full flex-1 flex-col bg-landing-bg text-landing-fg"
      style={backgroundStyle}
    >
      {/* BRAND-08: the logo sits above the form as the stacked lockup (spec §13), so the
          header carries only navigation -- one logo per screen, not two. */}
      <header className="landing-grid flex items-center justify-end px-6 py-6 sm:px-10">
        <div className="flex items-center gap-4">
          {/* Next to the sign-in toggle on purpose: somebody who cannot get in is the
              likeliest person on the site to need the documentation, and it is public. */}
          <Link
            href="/help"
            className="text-sm text-landing-muted transition-colors hover:text-landing-fg"
          >
            Help
          </Link>
          <AuthTabs />
        </div>
      </header>
      <main className="flex flex-1 items-center justify-center px-6 pb-16">
        <div className="flex w-full max-w-4xl items-center justify-center gap-16">
          <AuthInfoPanel />
          <div className="flex w-full max-w-sm flex-col items-center gap-6">
            <Link href="/" aria-label={branding.platformName}>
              {branding.logoUrl ? (
                // Superadmin-configured, arbitrary external URL -- next/image would need a
                // build-time domain allowlist for a value that changes at runtime.
                // eslint-disable-next-line @next/next/no-img-element
                <img src={branding.logoUrl} alt={branding.platformName} className="h-16 w-auto" />
              ) : (
                <WonderArkLogo variant="primary" size="sm" alt={branding.platformName} priority />
              )}
            </Link>
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}
