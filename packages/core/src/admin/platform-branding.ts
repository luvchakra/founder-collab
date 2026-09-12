import { z } from "zod";
import { createClient } from "../db/server";
import { createAdminClient } from "../db/admin";
import { requireSuperadmin } from "../rbac/platform-admin";

/**
 * PLATFORM-P0-03.1: "WonderArc Branding" (docs/plan/09-PLATFORM-ADMIN-PORTAL-BACKLOG.md
 * §7). `platform.branding` is a singleton row -- there is exactly one WonderArc brand, so
 * this reads/writes it directly rather than accepting/returning an id.
 *
 * Uses the request-scoped, cookie-authenticated client (not `createAdminClient`) for both
 * read and write: `platform.branding`'s own RLS policies (`platform.is_superadmin()`) are
 * the authoritative enforcement layer here, matching the architecture's "RLS
 * (authoritative)" rule for every other licensed/tenant table -- this is the platform-scope
 * equivalent even though there's no tenant/license axis. `requireSuperadmin()` below is the
 * defense-in-depth layer on top of that (mirrors `requireModule()`'s role for tenant
 * mutations), not a replacement for RLS.
 *
 * PLATFORM-P0-03.3 ("Platform Login Branding") added the `login*` background/legal-link
 * columns below and `getPublicLoginBranding()` -- the one exception to "RLS is
 * authoritative" in this file, since the consumer there is the *public, unauthenticated*
 * login page, not a superadmin. See that function's own docstring.
 */

export type PlatformBranding = {
  platformName: string;
  logoUrl: string | null;
  faviconUrl: string | null;
  primaryColor: string;
  secondaryColor: string | null;
  accentColor: string | null;
  loginHeadline: string | null;
  loginSupportText: string | null;
  emailFromName: string | null;
  footerText: string | null;
  supportEmail: string | null;
  supportUrl: string | null;
  loginBackgroundStyle: LoginBackgroundStyle;
  loginBackgroundValue: string | null;
  loginTermsUrl: string | null;
  loginPrivacyUrl: string | null;
  updatedAt: string;
  updatedBy: string | null;
};

type LoginBackgroundStyle = "gradient" | "solid" | "image";
const LOGIN_BACKGROUND_STYLES = ["gradient", "solid", "image"] as const;

type BrandingRow = {
  platform_name: string;
  logo_url: string | null;
  favicon_url: string | null;
  primary_color: string;
  secondary_color: string | null;
  accent_color: string | null;
  login_headline: string | null;
  login_support_text: string | null;
  email_from_name: string | null;
  footer_text: string | null;
  support_email: string | null;
  support_url: string | null;
  login_background_style: LoginBackgroundStyle;
  login_background_value: string | null;
  login_terms_url: string | null;
  login_privacy_url: string | null;
  updated_at: string;
  updated_by: string | null;
};

function toBranding(row: BrandingRow): PlatformBranding {
  return {
    platformName: row.platform_name,
    logoUrl: row.logo_url,
    faviconUrl: row.favicon_url,
    primaryColor: row.primary_color,
    secondaryColor: row.secondary_color,
    accentColor: row.accent_color,
    loginHeadline: row.login_headline,
    loginSupportText: row.login_support_text,
    emailFromName: row.email_from_name,
    footerText: row.footer_text,
    supportEmail: row.support_email,
    supportUrl: row.support_url,
    loginBackgroundStyle: row.login_background_style,
    loginBackgroundValue: row.login_background_value,
    loginTermsUrl: row.login_terms_url,
    loginPrivacyUrl: row.login_privacy_url,
    updatedAt: row.updated_at,
    updatedBy: row.updated_by,
  };
}

/** Reads the one branding row. `requireSuperadmin()` first -- this is called directly
 * from the `/platform/branding` page, which already sits under the layout's own gate, but
 * a data-access function shouldn't rely on its caller alone (same reasoning every other
 * `requireModule()`-guarded query in this codebase follows). */
export async function getPlatformBranding(): Promise<PlatformBranding> {
  await requireSuperadmin();
  const supabase = await createClient({ schema: "platform" });
  const { data, error } = await supabase.from("branding").select("*").eq("id", true).single();
  if (error) throw error;
  return toBranding(data as BrandingRow);
}

/** Empty string clears an optional field (stored as null); omitted/undefined leaves the
 * existing value untouched isn't supported here -- this is a full-form save, not a patch,
 * matching every field being present in the one settings form this backs. */
const hexColor = z
  .string()
  .trim()
  .regex(/^#[0-9a-fA-F]{6}$/, "Enter a 6-digit hex color, e.g. #2563eb");
const optionalHexColor = z
  .string()
  .trim()
  .transform((v) => (v === "" ? null : v))
  .pipe(hexColor.nullable());
const optionalUrl = z
  .string()
  .trim()
  .transform((v) => (v === "" ? null : v))
  .pipe(z.string().regex(/^https?:\/\//, "Enter a URL starting with http:// or https://").nullable());
const optionalEmail = z
  .string()
  .trim()
  .transform((v) => (v === "" ? null : v))
  .pipe(z.string().email("Enter a valid email address").nullable());
const optionalText = z
  .string()
  .trim()
  .transform((v) => (v === "" ? null : v));

/** PLATFORM-P0-03.3: background style is a closed vocabulary, never arbitrary CSS
 * (PLATFORM-P0-03.2's own "do not allow arbitrary CSS injection" rule applies here too,
 * even though 03.2 itself is deferred). */
const loginBackgroundStyle = z.enum(LOGIN_BACKGROUND_STYLES);

/** PLATFORM-P0-03.3: the value's required shape depends on the style it goes with (a URL
 * for `image`, one hex color for `solid`, two comma-separated hex colors for `gradient`) --
 * validated together with `.superRefine` below rather than per-field, mirroring the
 * database's own cross-column check constraint so the app rejects the same inputs the DB
 * would, with a field-level error instead of a raw Postgres error. */
const optionalBackgroundValue = z
  .string()
  .trim()
  .transform((v) => (v === "" ? null : v));

export const platformBrandingInputSchema = z
  .object({
    platformName: z.string().trim().min(1, "Platform name is required"),
    logoUrl: optionalUrl,
    faviconUrl: optionalUrl,
    primaryColor: hexColor,
    secondaryColor: optionalHexColor,
    accentColor: optionalHexColor,
    loginHeadline: optionalText,
    loginSupportText: optionalText,
    emailFromName: optionalText,
    footerText: optionalText,
    supportEmail: optionalEmail,
    supportUrl: optionalUrl,
    loginBackgroundStyle,
    loginBackgroundValue: optionalBackgroundValue,
    loginTermsUrl: optionalUrl,
    loginPrivacyUrl: optionalUrl,
  })
  .superRefine((data, ctx) => {
    const value = data.loginBackgroundValue;
    if (value === null) return;
    const patterns: Record<LoginBackgroundStyle, { regex: RegExp; message: string }> = {
      image: { regex: /^https?:\/\//, message: "Enter a URL starting with http:// or https://" },
      solid: { regex: /^#[0-9a-fA-F]{6}$/, message: "Enter one 6-digit hex color, e.g. #0f172a" },
      gradient: {
        regex: /^#[0-9a-fA-F]{6},#[0-9a-fA-F]{6}$/,
        message: "Enter two 6-digit hex colors separated by a comma, e.g. #0f172a,#312e81",
      },
    };
    const { regex, message } = patterns[data.loginBackgroundStyle];
    if (!regex.test(value)) {
      ctx.addIssue({ code: "custom", message, path: ["loginBackgroundValue"] });
    }
  });

export type PlatformBrandingInput = z.input<typeof platformBrandingInputSchema>;

/** Validates then writes every field in one call (03.1 has no draft/publish state yet --
 * that's PLATFORM-P0-03.5, a separate later story -- so a save takes effect immediately).
 * Returns per-field errors on failure so the form can show them next to the right input,
 * rather than one opaque top-level error string. */
export async function updatePlatformBranding(
  input: PlatformBrandingInput,
): Promise<{ ok: true; branding: PlatformBranding } | { ok: false; fieldErrors: Record<string, string> }> {
  await requireSuperadmin();

  const parsed = platformBrandingInputSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0];
      if (typeof key === "string" && !(key in fieldErrors)) fieldErrors[key] = issue.message;
    }
    return { ok: false, fieldErrors };
  }

  const supabase = await createClient({ schema: "platform" });
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data, error } = await supabase
    .from("branding")
    .update({
      platform_name: parsed.data.platformName,
      logo_url: parsed.data.logoUrl,
      favicon_url: parsed.data.faviconUrl,
      primary_color: parsed.data.primaryColor,
      secondary_color: parsed.data.secondaryColor,
      accent_color: parsed.data.accentColor,
      login_headline: parsed.data.loginHeadline,
      login_support_text: parsed.data.loginSupportText,
      email_from_name: parsed.data.emailFromName,
      footer_text: parsed.data.footerText,
      support_email: parsed.data.supportEmail,
      support_url: parsed.data.supportUrl,
      login_background_style: parsed.data.loginBackgroundStyle,
      login_background_value: parsed.data.loginBackgroundValue,
      login_terms_url: parsed.data.loginTermsUrl,
      login_privacy_url: parsed.data.loginPrivacyUrl,
      updated_by: user?.id ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", true)
    .select("*")
    .single();
  if (error) throw error;

  return { ok: true, branding: toBranding(data as BrandingRow) };
}

/** PLATFORM-P0-03.3: the subset of `platform.branding` safe to show on the public,
 * pre-authentication login screen (and its shared `(auth)` layout wrapper -- signup,
 * forgot-password, reset-password). */
export type PublicLoginBranding = {
  platformName: string;
  logoUrl: string | null;
  loginHeadline: string | null;
  loginSupportText: string | null;
  loginBackgroundStyle: LoginBackgroundStyle;
  loginBackgroundValue: string | null;
  loginTermsUrl: string | null;
  loginPrivacyUrl: string | null;
};

/**
 * PLATFORM-P0-03.3: reads the same singleton row `getPlatformBranding()` does, but for a
 * fundamentally different caller -- an anonymous visitor on `/login` (and its sibling auth
 * pages), who by definition cannot be a superadmin and would be refused by both
 * `requireSuperadmin()` and `platform.branding`'s own RLS policy (`select` gated on
 * `is_superadmin()`). This is deliberately the one place in this file that uses the
 * service-role client to read past that RLS policy -- safe to do because every field
 * returned here is display copy the login page would need to show *someone not yet signed
 * in* anyway (no keys, no credentials, no per-business data): the RLS policy exists to keep
 * this row *editable* by superadmins only, not to keep its display content secret. Every
 * other function in this file keeps RLS as the authoritative enforcement layer for
 * superadmin-only reads/writes; this one function's whole purpose is the one legitimate
 * carve-out from that, and it returns only the narrow `PublicLoginBranding` projection
 * below, never the full row (no `updated_by`, no other columns added later without this
 * function being deliberately extended).
 */
export async function getPublicLoginBranding(): Promise<PublicLoginBranding> {
  const supabase = createAdminClient({ schema: "platform" });
  const { data, error } = await supabase
    .from("branding")
    .select(
      "platform_name, logo_url, login_headline, login_support_text, login_background_style, login_background_value, login_terms_url, login_privacy_url",
    )
    .eq("id", true)
    .single();
  if (error) throw error;
  const row = data as Pick<
    BrandingRow,
    | "platform_name"
    | "logo_url"
    | "login_headline"
    | "login_support_text"
    | "login_background_style"
    | "login_background_value"
    | "login_terms_url"
    | "login_privacy_url"
  >;
  return {
    platformName: row.platform_name,
    logoUrl: row.logo_url,
    loginHeadline: row.login_headline,
    loginSupportText: row.login_support_text,
    loginBackgroundStyle: row.login_background_style,
    loginBackgroundValue: row.login_background_value,
    loginTermsUrl: row.login_terms_url,
    loginPrivacyUrl: row.login_privacy_url,
  };
}
