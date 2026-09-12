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
 *
 * PLATFORM-P0-03.4 ("Customer-Facing Branding Scope"): this file, `platform.branding`,
 * and everything under `/platform/branding` is WonderArc's own, singular, platform-wide
 * brand -- entirely separate from any future *business*-level branding (a business's own
 * logo/colors on its invoices, portal, or documents -- not built anywhere in this
 * codebase yet; the one forward-looking note that exists,
 * packages/module-fsm/src/components/settings/settings-view.tsx's "document footer"
 * comment, is explicit that it doesn't exist yet either). The two are kept structurally
 * separate, not just by naming convention: `platform.branding` lives in the `platform`
 * schema (never `core`/a module schema -- CLAUDE.md non-negotiable #1's own carve-out),
 * is reachable only via `/platform/branding` (a route no business admin's UI ever links
 * to -- `/platform/*` sits behind its own layout's `requireSuperadmin()`, a completely
 * different gate from `core.business_members.role`), and its RLS policies check
 * `platform.is_superadmin()` -- a function that has no `business_id` argument and
 * consults `platform.admins`, never `core.business_members`. A `core.business_members.role
 * = 'admin'` row (the actual "business administrator" concept elsewhere in this codebase)
 * grants no path to this table at all: confirmed live, not just by inspection, in
 * `scripts/test-platform-branding-rls.mjs`, which seeds exactly that row for a test user
 * and asserts she gets 0 rows on SELECT and a no-op on UPDATE against `platform.branding`,
 * while a real `platform.admins` superadmin succeeds at both. If/when a future story adds
 * business-level branding, it must live in its own `core`- or business-schema-owned
 * table, gated by ordinary business RLS (`tenant AND licensed`) -- never by reusing this
 * table, this route, or `platform.is_superadmin()`.
 *
 * PLATFORM-P0-03.5 ("Preview Before Publish"): "Global branding changes should not become
 * active merely because a field was edited." `updatePlatformBranding()` (03.1) wrote
 * straight to the live columns -- exactly what this story forbids. It's replaced by three
 * functions that split Edit from Publish via one extra `draft_data` JSONB column on the
 * same singleton row (see the migration's own docstring for why one JSONB column, not ~16
 * mirrored `draft_*` columns): `saveBrandingDraft()` (Edit -- writes only the draft, live
 * columns untouched), `publishBrandingDraft()` (Publish -- copies the current draft into
 * the live columns and clears it), and `discardBrandingDraft()` (abandon a pending draft
 * without publishing it). `getPublicLoginBranding()` above already only ever reads the
 * live columns, so this story needed no change there -- an unpublished draft was already
 * structurally invisible to it before this file even had a name for "draft".
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
  draft_data: PlatformBrandingValues | null;
  draft_updated_by: string | null;
  draft_updated_at: string | null;
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

/** PLATFORM-P0-03.5: the pure inverse of `toBranding()` -- turns the live, published
 * record back into the same shape the edit form's fields submit (`PlatformBrandingInput`).
 * Used only as the Edit form's pre-fill fallback when there is no pending draft yet (so
 * "Edit" always starts from *something* real rather than blank fields); once a draft
 * exists, the form pre-fills from the draft itself instead (`getPlatformBrandingDraft()`
 * below), since that's the whole point of a draft surviving between visits. Kept as its
 * own pure, exported function (no I/O) so it's unit-testable on its own rather than only
 * indirectly through a live read. */
export function toInputFromBranding(branding: PlatformBranding): PlatformBrandingInput {
  return {
    platformName: branding.platformName,
    logoUrl: branding.logoUrl ?? "",
    faviconUrl: branding.faviconUrl ?? "",
    primaryColor: branding.primaryColor,
    secondaryColor: branding.secondaryColor ?? "",
    accentColor: branding.accentColor ?? "",
    loginHeadline: branding.loginHeadline ?? "",
    loginSupportText: branding.loginSupportText ?? "",
    emailFromName: branding.emailFromName ?? "",
    footerText: branding.footerText ?? "",
    supportEmail: branding.supportEmail ?? "",
    supportUrl: branding.supportUrl ?? "",
    loginBackgroundStyle: branding.loginBackgroundStyle,
    loginBackgroundValue: branding.loginBackgroundValue ?? "",
    loginTermsUrl: branding.loginTermsUrl ?? "",
    loginPrivacyUrl: branding.loginPrivacyUrl ?? "",
  };
}

/** Reads the one branding row -- the live, *published* values only (never the pending
 * draft; see `getPlatformBrandingDraft()` for that). `requireSuperadmin()` first -- this
 * is called directly from the `/platform/branding` page, which already sits under the
 * layout's own gate, but a data-access function shouldn't rely on its caller alone (same
 * reasoning every other `requireModule()`-guarded query in this codebase follows). */
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

/** What the edit form submits: every optional field is a plain string ("" clears it). */
export type PlatformBrandingInput = z.input<typeof platformBrandingInputSchema>;

/** What comes out of validation (and what `draft_data` stores): "" has already become
 * `null` for optional fields. Distinct from `PlatformBrandingInput` because re-running
 * `platformBrandingInputSchema` on its own *output* would fail -- the schema's optional
 * fields only accept a string on the way in, not the `null` they produce on the way out.
 * `saveBrandingDraft()` stores this shape directly rather than round-tripping it back
 * through the schema a second time at publish time (see `publishBrandingDraft()`). */
export type PlatformBrandingValues = z.output<typeof platformBrandingInputSchema>;

function fieldErrorsFrom(error: z.ZodError): Record<string, string> {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path[0];
    if (typeof key === "string" && !(key in fieldErrors)) fieldErrors[key] = issue.message;
  }
  return fieldErrors;
}

/** Maps a validated `PlatformBrandingValues` onto the live columns' update payload. Shared
 * by `publishBrandingDraft()` below -- the only place that ever writes to the live
 * columns now that PLATFORM-P0-03.5 requires Edit and Publish to be separate steps
 * (`saveBrandingDraft()` writes `draft_data` only, never these). */
function toRowUpdate(input: PlatformBrandingValues) {
  return {
    platform_name: input.platformName,
    logo_url: input.logoUrl,
    favicon_url: input.faviconUrl,
    primary_color: input.primaryColor,
    secondary_color: input.secondaryColor,
    accent_color: input.accentColor,
    login_headline: input.loginHeadline,
    login_support_text: input.loginSupportText,
    email_from_name: input.emailFromName,
    footer_text: input.footerText,
    support_email: input.supportEmail,
    support_url: input.supportUrl,
    login_background_style: input.loginBackgroundStyle,
    login_background_value: input.loginBackgroundValue,
    login_terms_url: input.loginTermsUrl,
    login_privacy_url: input.loginPrivacyUrl,
  };
}

/** PLATFORM-P0-03.5 ("Preview Before Publish"): the Edit step. Validates the form input
 * exactly like the old `updatePlatformBranding()` did, but writes only `draft_data` --
 * the live columns (and everything every consuming surface, e.g. `getPublicLoginBranding()`,
 * reads) are untouched. Returns per-field errors on failure so the form can show them next
 * to the right input, rather than one opaque top-level error string. */
export async function saveBrandingDraft(
  input: PlatformBrandingInput,
): Promise<{ ok: true; draftUpdatedAt: string } | { ok: false; fieldErrors: Record<string, string> }> {
  await requireSuperadmin();

  const parsed = platformBrandingInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, fieldErrors: fieldErrorsFrom(parsed.error) };
  }

  const supabase = await createClient({ schema: "platform" });
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const draftUpdatedAt = new Date().toISOString();

  const { error } = await supabase
    .from("branding")
    .update({
      draft_data: parsed.data,
      draft_updated_by: user?.id ?? null,
      draft_updated_at: draftUpdatedAt,
    })
    .eq("id", true);
  if (error) throw error;

  return { ok: true, draftUpdatedAt };
}

/** PLATFORM-P0-03.5: reads the one branding row's *draft* state -- what the Edit form and
 * Preview page should show. When a draft is pending, its saved values are returned as-is
 * (it already passed `platformBrandingInputSchema` when `saveBrandingDraft()` wrote it).
 * When there is no draft, falls back to the live, published values via
 * `toInputFromBranding()` -- so "Edit" always starts from the real current state of the
 * world, live or drafted, never blank fields. */
export async function getPlatformBrandingDraft(): Promise<{
  hasDraft: boolean;
  values: PlatformBrandingValues;
  draftUpdatedAt: string | null;
}> {
  await requireSuperadmin();
  const supabase = await createClient({ schema: "platform" });
  const { data, error } = await supabase.from("branding").select("*").eq("id", true).single();
  if (error) throw error;
  const row = data as BrandingRow;

  if (row.draft_data) {
    return { hasDraft: true, values: row.draft_data, draftUpdatedAt: row.draft_updated_at };
  }
  return { hasDraft: false, values: toInputFromBranding(toBranding(row)), draftUpdatedAt: null };
}

/** PLATFORM-P0-03.5: the Publish step -- copies the current draft onto the live columns
 * (so every consuming surface, e.g. the public login page via `getPublicLoginBranding()`,
 * now sees it) and clears the draft. Refuses with a plain error rather than throwing when
 * there's nothing pending, since "Publish" with no draft is a normal (if pointless) UI
 * state to land on, not an exceptional one.
 *
 * Does not re-run `platformBrandingInputSchema` on the stored draft: `draft_data` is
 * always the schema's own *output* (`saveBrandingDraft()` only ever stores
 * `parsed.data`), and re-parsing that output as if it were fresh form input would fail --
 * the schema's optional-field branches accept a string on the way in but produce `null` on
 * the way out, so feeding a previously-produced `null` back in as "input" throws a type
 * error, not a validation pass. The stored draft is already exactly as trustworthy as the
 * live columns it's about to become: it can only have been written by this same
 * `requireSuperadmin()`-gated, RLS-protected function in the first place. */
export async function publishBrandingDraft(): Promise<
  { ok: true; branding: PlatformBranding } | { ok: false; error: string }
> {
  await requireSuperadmin();
  const supabase = await createClient({ schema: "platform" });

  const { data: existing, error: readError } = await supabase
    .from("branding")
    .select("draft_data")
    .eq("id", true)
    .single();
  if (readError) throw readError;
  const draft = (existing as { draft_data: PlatformBrandingValues | null }).draft_data;
  if (!draft) {
    return { ok: false, error: "There is no pending draft to publish." };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data, error } = await supabase
    .from("branding")
    .update({
      ...toRowUpdate(draft),
      updated_by: user?.id ?? null,
      updated_at: new Date().toISOString(),
      draft_data: null,
      draft_updated_by: null,
      draft_updated_at: null,
    })
    .eq("id", true)
    .select("*")
    .single();
  if (error) throw error;

  return { ok: true, branding: toBranding(data as BrandingRow) };
}

/** PLATFORM-P0-03.5: abandons a pending draft without publishing it -- the Edit form's
 * escape hatch back to the live values (a superadmin who saved a draft they no longer want
 * would otherwise have to manually retype every live value as a "correcting" draft just to
 * get back to a clean slate). A no-op, not an error, when there is no draft to discard. */
export async function discardBrandingDraft(): Promise<void> {
  await requireSuperadmin();
  const supabase = await createClient({ schema: "platform" });
  const { error } = await supabase
    .from("branding")
    .update({ draft_data: null, draft_updated_by: null, draft_updated_at: null })
    .eq("id", true);
  if (error) throw error;
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
