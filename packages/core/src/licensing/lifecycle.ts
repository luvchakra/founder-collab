import { createAdminClient } from "../db/admin";
import { replayParkedEvents } from "../events/drain";
import type { LicenseEventType, LicenseStatus, ModuleKey } from "./types";

const GRACE_PERIOD_DAYS = 30;

function coreAdmin() {
  return createAdminClient({ schema: "core" });
}

/**
 * No payment processor is wired up yet (apps/web's billing settings page says as much),
 * so there's no real invoicing schedule to read a renewal date from -- the simplest
 * concept that still means something is a monthly cycle anchored on the date the license
 * was first activated. Returns the next occurrence of that anchor day-of-month strictly
 * after `from`. (A short month rolling a 29-31 anchor into the following month is an
 * accepted rough edge with no real billing system behind it yet.)
 */
export function nextBillingCycleDate(activatedAt: string | Date, from: Date = new Date()): Date {
  const anchor = new Date(activatedAt);
  const next = new Date(from);
  next.setUTCHours(anchor.getUTCHours(), anchor.getUTCMinutes(), anchor.getUTCSeconds(), 0);
  next.setUTCDate(anchor.getUTCDate());
  if (next <= from) next.setUTCMonth(next.getUTCMonth() + 1);
  return next;
}

/**
 * Writes to core.license_events (C-3) -- the durable record of every state transition --
 * and, now that D-9 has built core.domain_events, also publishes a `license.<eventType>`
 * domain event other modules can react to (e.g. an onboarding checklist reacting to a
 * module being bought). Inserted directly through the admin client rather than the
 * publish() helper (D-9): activateLicense()/deactivateLicense() can run with no signed-in
 * user in scope (a billing webhook, admin tooling), and publish() needs the RLS-scoped
 * session client's cookie context to resolve who's publishing.
 */
async function recordLicenseEvent(
  licenseId: string,
  businessId: string,
  moduleKey: string,
  eventType: LicenseEventType,
): Promise<void> {
  const supabase = coreAdmin();
  const { error } = await supabase.from("license_events").insert({
    license_id: licenseId,
    business_id: businessId,
    module_key: moduleKey,
    event_type: eventType,
  });
  if (error) throw error;

  const { error: eventError } = await supabase.from("domain_events").insert({
    business_id: businessId,
    type: `license.${eventType}`,
    payload: { module_key: moduleKey, license_id: licenseId },
  });
  if (eventError) throw eventError;
}

/**
 * Activates a business's license for a module -- creates the license row if none exists
 * yet, or restores an existing cancelled/grace/expired one back to 'active'. Idempotent:
 * calling this on an already-active license (with no pending cancellation) is a no-op
 * past the initial read.
 *
 * Also doubles as "undo cancellation": a license that's still 'active' but has a
 * `cancel_at` scheduled (cancelLicense() below) is exactly the state this restores to
 * "just active, nothing pending" by clearing cancel_at -- same button/action as a full
 * reactivation from grace/expired, just a smaller step since read/write access never
 * actually stopped.
 *
 * ADR-9: reactivation always restores everything, no matter how long the license was
 * inactive -- there's no "too late to reactivate" state.
 */
export async function activateLicense(businessId: string, moduleKey: ModuleKey): Promise<void> {
  const supabase = coreAdmin();
  const { data: existing, error: selectError } = await supabase
    .from("licenses")
    .select("id, status, cancel_at")
    .eq("business_id", businessId)
    .eq("module_key", moduleKey)
    .maybeSingle();
  if (selectError) throw selectError;

  if (existing) {
    if ((existing.status as LicenseStatus) === "active") {
      if (existing.cancel_at) {
        const { error } = await supabase.from("licenses").update({ cancel_at: null }).eq("id", existing.id);
        if (error) throw error;
        await recordLicenseEvent(existing.id, businessId, moduleKey, "cancellation_undone");
      }
      return;
    }
    const { error } = await supabase
      .from("licenses")
      .update({
        status: "active",
        deactivated_at: null,
        grace_ends_at: null,
        cancel_at: null,
        activated_at: new Date().toISOString(),
      })
      .eq("id", existing.id);
    if (error) throw error;
    await recordLicenseEvent(existing.id, businessId, moduleKey, "reactivated");
    await replayParkedEvents(businessId, moduleKey);
    return;
  }

  const { data: business, error: businessError } = await supabase
    .from("businesses")
    .select("account_id")
    .eq("id", businessId)
    .single();
  if (businessError) throw businessError;

  const { data: created, error: insertError } = await supabase
    .from("licenses")
    .insert({
      account_id: business.account_id,
      business_id: businessId,
      module_key: moduleKey,
      status: "active",
    })
    .select("id")
    .single();
  if (insertError) throw insertError;

  await recordLicenseEvent(created.id, businessId, moduleKey, "activated");
  await replayParkedEvents(businessId, moduleKey);
}

/**
 * Starts the actual deactivation of a business's license for a module -- moves it to
 * 'grace' for 30 days (ADR-9, CLAUDE.md non-negotiable #4: never deletes data).
 * core.has_module() keeps returning true (read access continues) while
 * core.has_module_write() flips to false immediately. A scheduled call to
 * expireGracePeriods() later flips grace -> expired once the window elapses. A no-op if
 * the business never had a license for this module.
 *
 * Not called directly from the cancel button any more -- see cancelLicense() below,
 * which schedules this instead of running it immediately. processDueCancellations()
 * calls this once a license's billing cycle actually ends. Kept exported/separate
 * (rather than folded into that sweep) since it's also the right primitive for an
 * immediate, no-notice deactivation if one is ever needed (a chargeback, a ToS
 * violation) rather than the founder-initiated cancel flow.
 */
export async function deactivateLicense(businessId: string, moduleKey: ModuleKey): Promise<void> {
  const supabase = coreAdmin();
  const graceEndsAt = new Date(Date.now() + GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from("licenses")
    .update({
      status: "grace",
      deactivated_at: new Date().toISOString(),
      grace_ends_at: graceEndsAt,
      cancel_at: null,
    })
    .eq("business_id", businessId)
    .eq("module_key", moduleKey)
    .select("id")
    .maybeSingle();
  if (error) throw error;
  if (!data) return;

  await recordLicenseEvent(data.id, businessId, moduleKey, "deactivated");
}

/**
 * The founder-facing "Cancel" action: schedules the license to start its grace period
 * at the next billing cycle instead of deactivating it immediately -- full read/write
 * access continues right up to `cancel_at` (status stays 'active' the whole time; only
 * the has_module_write()/has_module() checks decide that, and both only look at
 * `status`). Calling this again just reschedules cancel_at; activateLicense() is what
 * undoes it. A no-op if the business has no active license for this module (nothing to
 * cancel -- already in grace/expired/cancelled, or never licensed at all).
 */
export async function cancelLicense(businessId: string, moduleKey: ModuleKey): Promise<void> {
  const supabase = coreAdmin();
  const { data: existing, error: selectError } = await supabase
    .from("licenses")
    .select("id, status, activated_at")
    .eq("business_id", businessId)
    .eq("module_key", moduleKey)
    .maybeSingle();
  if (selectError) throw selectError;
  if (!existing || (existing.status as LicenseStatus) !== "active") return;

  const cancelAt = nextBillingCycleDate(existing.activated_at).toISOString();
  const { error } = await supabase.from("licenses").update({ cancel_at: cancelAt }).eq("id", existing.id);
  if (error) throw error;

  await recordLicenseEvent(existing.id, businessId, moduleKey, "cancellation_scheduled");
}

/** Same effect as activateLicense on an existing license -- kept as its own name for
 * callers (e.g. the licenses admin UI, C-6) where "reactivate" is the actual intent
 * rather than "activate, creating one if it doesn't exist yet". */
export async function reactivateLicense(businessId: string, moduleKey: ModuleKey): Promise<void> {
  await activateLicense(businessId, moduleKey);
}

/**
 * Flips every license whose grace period has elapsed to 'expired'. Meant to run on a
 * schedule (a cron route, once core.jobs/D-9's scheduled-processing pattern exists) --
 * this function is only the state transition itself, no scheduling infrastructure.
 * Returns the number of licenses expired, for the caller to log.
 */
export async function expireGracePeriods(): Promise<number> {
  const supabase = coreAdmin();
  const { data, error } = await supabase
    .from("licenses")
    .update({ status: "expired" })
    .eq("status", "grace")
    .lte("grace_ends_at", new Date().toISOString())
    .select("id, business_id, module_key");
  if (error) throw error;

  for (const license of data ?? []) {
    await recordLicenseEvent(license.id, license.business_id, license.module_key, "expired");
  }
  return data?.length ?? 0;
}

/**
 * The other half of the cancel flow: finds every license still `active` whose
 * `cancel_at` has arrived and runs deactivateLicense() on it (active -> grace, exactly
 * as if the founder had cancelled with no notice) -- the step cancelLicense() deferred.
 * Meant to run on the same daily schedule as expireGracePeriods(); returns the number of
 * licenses moved into their grace period, for the caller to log.
 */
export async function processDueCancellations(): Promise<number> {
  const supabase = coreAdmin();
  const { data, error } = await supabase
    .from("licenses")
    .select("business_id, module_key")
    .eq("status", "active")
    .not("cancel_at", "is", null)
    .lte("cancel_at", new Date().toISOString());
  if (error) throw error;

  for (const license of data ?? []) {
    await deactivateLicense(license.business_id, license.module_key as ModuleKey);
  }
  return data?.length ?? 0;
}

/**
 * Idempotent per-module seed hook (C-4): every new business gets a free `discovery`
 * license immediately -- discovery is the platform's already-shipped, zero-friction
 * module (00-MASTER-PLAN.md's product shape has discovery already existing while every
 * other module is opt-in), and requiring an explicit purchase for it now would regress
 * behaviour that already works today. Safe to call more than once for the same business
 * -- activateLicense() is itself idempotent.
 */
export async function seedDefaultLicenses(businessId: string): Promise<void> {
  await activateLicense(businessId, "discovery");
}
