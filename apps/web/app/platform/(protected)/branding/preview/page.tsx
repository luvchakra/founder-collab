import Link from "next/link";
import { getPlatformBrandingDraft } from "@cofounderai/core/admin/platform-branding";
import { backgroundStyleFor } from "@/lib/login-branding";
import { Card, CardContent, CardHeader, CardTitle } from "@cofounderai/core/ui/card";
import { PublishControls } from "../publish-controls";

/**
 * PLATFORM-P0-03.5 ("Preview Before Publish", docs/plan/09-PLATFORM-ADMIN-PORTAL-BACKLOG.md
 * §7): "Provide Edit / Preview / Publish. Global branding changes should not become active
 * merely because a field was edited." This is the Preview step -- it renders what the
 * pending draft (or, with no draft pending, the currently *live* values -- see below)
 * would look like on the real, public `/login` page, without touching the live
 * `platform.branding` columns at all: `getPlatformBrandingDraft()` never writes anything.
 *
 * Deliberately a static visual mock, not the real `AuthForm`/`login` server action: this
 * page is reached by an authenticated SUPERADMIN, and wiring the actual interactive login
 * form into an admin preview screen would let a signed-in session accidentally trigger a
 * real auth action from inside a "just looking" preview -- a footgun this story doesn't
 * need to accept for what it's asking (see what the copy/branding will look like), so the
 * email/password inputs below are inert.
 *
 * Only the login page's own fields (logo, headline, support text, background, legal
 * links) are genuinely previewable this way, because they're the only branding fields any
 * live surface reads today (`getPublicLoginBranding()`, wired in PLATFORM-P0-03.3). The
 * summary card below the mock login covers the rest of the record (name, colors, footer,
 * email-from-name) so a superadmin can still see the whole draft in one place -- clearly
 * labeled as "not wired into any live surface yet" (03.1's own long-standing scope note),
 * not implied to be part of what the mock above renders.
 */
export default async function BrandingPreviewPage() {
  const draft = await getPlatformBrandingDraft();
  const { values } = draft;
  const backgroundStyle = backgroundStyleFor(values.loginBackgroundStyle, values.loginBackgroundValue);
  const hasLegalLinks = Boolean(values.loginTermsUrl || values.loginPrivacyUrl);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <div>
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-xl font-semibold">Preview: WonderArc Branding</h1>
          <Link href="/platform/branding" className="text-sm text-zinc-400 hover:text-zinc-100">
            ← Back to edit
          </Link>
        </div>
        <p className="text-sm text-zinc-400">
          {draft.hasDraft
            ? "Showing the pending, unpublished draft -- nobody sees this until you publish it."
            : "There's no pending draft -- this is the currently published branding, live right now."}
        </p>
      </div>

      <PublishControls hasDraft={draft.hasDraft} draftUpdatedAt={draft.draftUpdatedAt} showPreviewLink={false} />

      <Card className="border-zinc-800 bg-zinc-900 text-zinc-50">
        <CardHeader>
          <CardTitle className="text-sm font-semibold text-zinc-200">Login page mock</CardTitle>
        </CardHeader>
        <CardContent>
          <div
            className="landing-theme dark overflow-hidden rounded-xl border border-zinc-800 bg-landing-bg"
            style={backgroundStyle}
          >
            <div className="flex items-center justify-between px-6 py-5">
              <span className="flex items-center gap-2 text-lg font-semibold tracking-tight text-landing-fg">
                {values.logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- superadmin-configured, runtime URL
                  <img src={values.logoUrl} alt={values.platformName} className="h-7 w-auto" />
                ) : (
                  <span>
                    CoFounder<span className="text-landing-accent">AI</span>
                  </span>
                )}
              </span>
              <span className="text-xs text-landing-muted">Log in · Sign up</span>
            </div>
            <div className="flex items-center justify-center px-6 pb-12">
              <div className="w-full max-w-sm rounded-2xl border border-landing-surface-border bg-landing-surface p-8">
                <h2 className="text-2xl font-semibold text-landing-fg">
                  {values.loginHeadline || "Welcome back, Founder."}
                </h2>
                <p className="mt-2 text-sm text-landing-muted">
                  {values.loginSupportText || "Your next customer is waiting."}
                </p>
                <div className="mt-8 flex flex-col gap-3" aria-hidden="true">
                  <div className="h-9 rounded-md border border-landing-surface-border bg-landing-bg/40" />
                  <div className="h-9 rounded-md border border-landing-surface-border bg-landing-bg/40" />
                  <div className="h-9 rounded-md bg-landing-accent/80" />
                </div>
                {hasLegalLinks ? (
                  <p className="mt-6 text-center text-xs text-landing-muted">
                    {values.loginTermsUrl ? <span className="underline">Terms</span> : null}
                    {values.loginTermsUrl && values.loginPrivacyUrl ? " · " : null}
                    {values.loginPrivacyUrl ? <span className="underline">Privacy</span> : null}
                  </p>
                ) : null}
              </div>
            </div>
          </div>
          <p className="mt-3 text-xs text-zinc-500">
            A static mock, not the real login form -- inputs above aren&apos;t interactive.
          </p>
        </CardContent>
      </Card>

      <Card className="border-zinc-800 bg-zinc-900 text-zinc-50">
        <CardHeader>
          <CardTitle className="text-sm font-semibold text-zinc-200">Everything else in this draft</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm sm:grid-cols-2">
          <SummaryField label="Platform name" value={values.platformName} />
          <SummaryField label="Support contact" value={[values.supportEmail, values.supportUrl].filter(Boolean).join(" · ") || "—"} />
          <SummaryColor label="Primary brand" value={values.primaryColor} />
          <SummaryColor label="Secondary brand" value={values.secondaryColor} />
          <SummaryColor label="Accent color" value={values.accentColor} />
          <SummaryField label="Email from name" value={values.emailFromName || "—"} />
          <SummaryField label="Favicon URL" value={values.faviconUrl || "—"} />
          <SummaryField label="Footer text" value={values.footerText || "—"} />
        </CardContent>
      </Card>
      <p className="text-xs text-zinc-500">
        These fields aren&apos;t wired into any live surface yet (PLATFORM-P0-03.1&apos;s own
        scope note) -- shown here so the whole draft is visible in one place, not implied
        to appear in the login mock above.
      </p>
    </div>
  );
}

function SummaryField({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs uppercase tracking-wide text-zinc-500">{label}</span>
      <span className="text-zinc-100">{value}</span>
    </div>
  );
}

function SummaryColor({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs uppercase tracking-wide text-zinc-500">{label}</span>
      <span className="flex items-center gap-2 text-zinc-100">
        <span
          className="size-4 shrink-0 rounded border border-zinc-700"
          style={{ backgroundColor: value ?? "transparent" }}
          aria-hidden="true"
        />
        {value ?? "—"}
      </span>
    </div>
  );
}
