import { z } from "zod";
import { createClient } from "../db/server";
import { requireSuperadmin } from "../rbac/platform-admin";

/**
 * PLATFORM-P0-11.3 ("Notification Policies", docs/plan/09-PLATFORM-ADMIN-PORTAL-BACKLOG.md
 * §15). See the migration's own docstring (`20260912420000_platform_notification_policies.sql`)
 * for the entity-ownership reasoning (distinct from the not-yet-built
 * `core.notifications`/`core.notification_prefs` pair the master plan's own entity map
 * names) and for why the plain RLS-gated update pattern was chosen over PLATFORM-P0-11.1/
 * 11.2's own audited-RPC shape.
 *
 * Config-only: no in-app or push notification delivery mechanism exists anywhere in this
 * codebase, and even the one channel with real infrastructure elsewhere (email, via
 * Resend -- see `platform-email-provider.ts`'s own docstring) reads nothing from this
 * table. A future wiring story's job, not this one's.
 */

export type NotificationPolicies = {
  emailEnabled: boolean;
  inAppEnabled: boolean;
  pushEnabled: boolean;
  updatedAt: string;
  updatedBy: string | null;
};

type NotificationPoliciesRow = {
  email_enabled: boolean;
  in_app_enabled: boolean;
  push_enabled: boolean;
  updated_at: string;
  updated_by: string | null;
};

function toPolicies(row: NotificationPoliciesRow): NotificationPolicies {
  return {
    emailEnabled: row.email_enabled,
    inAppEnabled: row.in_app_enabled,
    pushEnabled: row.push_enabled,
    updatedAt: row.updated_at,
    updatedBy: row.updated_by,
  };
}

export async function getNotificationPolicies(): Promise<NotificationPolicies> {
  await requireSuperadmin();
  const supabase = await createClient({ schema: "platform" });
  const { data, error } = await supabase.from("notification_policies").select("*").eq("id", true).single();
  if (error) throw error;
  return toPolicies(data as NotificationPoliciesRow);
}

export const updateNotificationPoliciesSchema = z.object({
  emailEnabled: z.boolean(),
  inAppEnabled: z.boolean(),
  pushEnabled: z.boolean(),
});
export type UpdateNotificationPoliciesInput = z.input<typeof updateNotificationPoliciesSchema>;

export async function updateNotificationPolicies(
  input: UpdateNotificationPoliciesInput,
): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireSuperadmin();
  const parsed = updateNotificationPoliciesSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };

  const supabase = await createClient({ schema: "platform" });
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { error } = await supabase
    .from("notification_policies")
    .update({
      email_enabled: parsed.data.emailEnabled,
      in_app_enabled: parsed.data.inAppEnabled,
      push_enabled: parsed.data.pushEnabled,
      updated_by: user?.id ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", true);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
