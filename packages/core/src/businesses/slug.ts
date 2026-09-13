import { createAdminClient } from "../db/admin";

/** Every path segment the app already owns statically -- a business slug must never
 * collide with one, since packages/core/src/db/middleware.ts's route guard tells a
 * business-scoped route apart from a static one purely by whether the URL's first
 * segment is one of these, not by position. Mirrors the CHECK constraint on
 * core.business_settings.slug (supabase/migrations/20260913740000_*) -- kept as its own
 * list here too (rather than reading the constraint back from Postgres) so a slug can be
 * rejected before ever reaching the database. */
export const RESERVED_BUSINESS_SLUGS = new Set([
  "dashboard",
  "platform",
  "login",
  "signup",
  "forgot-password",
  "reset-password",
  "onboarding",
  "auth",
  "api",
  "p",
]);

/** Lowercase, hyphen-separated, alphanumeric-only -- matches
 * core.business_settings.slug's own CHECK constraint format exactly, so a slug this
 * function returns is always valid to insert without a second, redundant validation
 * pass at the call site. */
export function slugify(name: string): string {
  const candidate = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-|-$/g, "");
  return candidate || "business";
}

/**
 * Generates a slug for a new business: `slugify(name)`, plus a numeric suffix if that's
 * already taken by another business or collides with a reserved static path
 * (`RESERVED_BUSINESS_SLUGS`). Uses the service-role client deliberately -- slugs are
 * globally unique (core.business_settings.slug's own UNIQUE constraint) and a slug
 * collision-check has to see every business on the platform, not just ones the creating
 * user is already a member of; core.business_settings' own RLS policy scopes SELECT to
 * `user_business_ids()` precisely so an ordinary read can't do that. Never returns
 * business data, only a yes/no "is this string taken" existence check, the same narrow
 * cross-tenant carve-out `resolveContactFormBusiness()`
 * (packages/module-fsm/src/lib/work-requests/queries.ts) already relies on for the same
 * table.
 */
export async function generateUniqueBusinessSlug(name: string): Promise<string> {
  const base = slugify(name);
  const admin = createAdminClient({ schema: "core" });

  let candidate = RESERVED_BUSINESS_SLUGS.has(base) ? `${base}-business` : base;
  let suffix = 1;
  for (;;) {
    const { data, error } = await admin
      .from("business_settings")
      .select("business_id")
      .eq("slug", candidate)
      .maybeSingle();
    if (error) throw error;
    if (!data) return candidate;
    suffix += 1;
    candidate = `${base}-${suffix}`;
  }
}
