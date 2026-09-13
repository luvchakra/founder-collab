import Link from "next/link";
import Image from "next/image";
import type { ReactNode } from "react";
import { AuthTabs } from "@/components/auth/auth-tabs";
import { backgroundStyleFor } from "@/lib/login-branding";
import { getPublicLoginBranding } from "@cofounderai/core/admin/platform-branding";
import { BRAND_NAME } from "@cofounderai/core/lib/brand";

// Every page under `(auth)` was previously a static-prerendering candidate (no dynamic
// API used) -- now that this shared layout reads live `platform.branding` config on every
// render, it can no longer be prerendered at build time: `next build` has no
// SUPABASE_SERVICE_ROLE_KEY in an environment with no `.env.local` (the exact trap
// PLATFORM-P0-02 hit for `/platform` itself), so the build fails at the prerender step
// rather than falling back gracefully. Forced dynamic here for the same reason that fix
// was forced rather than relied on Next's own dynamic-API auto-detection.
export const dynamic = "force-dynamic";

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
 * `apps/web/app/globals.css`'s own `.landing-theme` tokens (the WonderArc brand, shared
 * with the marketing site) by default, while making it configurable, which is what this
 * story asks for -- not a conflict with that, since nothing changes unless a superadmin
 * opts in.
 *
 * PLATFORM-P0-03.5: `backgroundStyleFor()` moved to `@/lib/login-branding` so the new
 * branding preview page (`/platform/branding/preview`) can apply the exact same treatment
 * to a *draft* value without duplicating this logic.
 */
export default async function AuthLayout({ children }: { children: ReactNode }) {
  const branding = await getPublicLoginBranding();
  const backgroundStyle = backgroundStyleFor(branding.loginBackgroundStyle, branding.loginBackgroundValue);

  return (
    <div
      className="landing-theme flex min-h-full flex-1 flex-col bg-landing-bg text-landing-fg"
      style={backgroundStyle}
    >
      <header className="landing-grid flex items-center justify-between px-6 py-6 sm:px-10">
        <Link href="/" aria-label={BRAND_NAME} className="flex items-center gap-2">
          {branding.logoUrl ? (
            // Superadmin-configured, arbitrary external URL -- next/image would need a
            // build-time domain allowlist for a value that changes at runtime.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={branding.logoUrl} alt={branding.platformName} className="h-7 w-auto" />
          ) : (
            <Image src="/logo-lockup.png" alt={BRAND_NAME} width={900} height={218} priority className="h-7 w-auto" />
          )}
        </Link>
        <AuthTabs />
      </header>
      <main className="flex flex-1 items-center justify-center px-6 pb-16">{children}</main>
    </div>
  );
}
