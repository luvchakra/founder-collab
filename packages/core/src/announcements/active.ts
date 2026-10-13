import { createClient } from "../db/server";

/**
 * PLATFORM-P1-10.13: the announcements a customer sees in the app, per business. Read under the
 * signed-in user's own RLS: a notice for one organization is only readable by that
 * organization's members (migration 20261013110000), everything else by any signed-in user.
 * Country-targeted notices aren't shown: a business records no country to match them against.
 */
export type CustomerAnnouncement = {
  id: string;
  type: "information" | "warning" | "maintenance" | "critical";
  title: string;
  message: string;
  audienceType: "all_customers" | "all_users" | "specific_plan" | "specific_country" | "specific_business";
  audiencePlanId: string | null;
  audienceBusinessId: string | null;
  publishAt: string | null;
  expireAt: string | null;
  enabled: boolean;
};

/** Which announcements show for one business right now. Pure, for tests. */
export function announcementsForBusiness(
  list: CustomerAnnouncement[],
  business: { id: string; planId: string | null },
  now: number = Date.now(),
): CustomerAnnouncement[] {
  return list.filter((a) => {
    if (!a.enabled) return false;
    if (a.publishAt && Date.parse(a.publishAt) > now) return false;
    if (a.expireAt && Date.parse(a.expireAt) <= now) return false;
    switch (a.audienceType) {
      case "all_customers":
      case "all_users":
        return true;
      case "specific_plan":
        return a.audiencePlanId !== null && a.audiencePlanId === business.planId;
      case "specific_business":
        return a.audienceBusinessId === business.id;
      default:
        return false;
    }
  });
}

/** Active announcements for each of the given businesses (the user's own). Empty on any read
 * failure: a notice is helpful, never a reason to break the page. */
export async function getAnnouncementsByBusiness(businessIds: string[]): Promise<Record<string, CustomerAnnouncement[]>> {
  if (businessIds.length === 0) return {};
  try {
    const platform = await createClient({ schema: "platform" });
    const core = await createClient({ schema: "core" });
    const nowIso = new Date().toISOString();
    const [announcements, plans, settings] = await Promise.all([
      platform
        .from("announcements")
        .select("id, type, title, message, audience_type, audience_plan_id, audience_business_id, publish_at, expire_at, enabled")
        .eq("enabled", true)
        .or(`expire_at.is.null,expire_at.gt.${nowIso}`),
      platform.from("plans").select("id, key"),
      core.from("business_settings").select("business_id, plan").in("business_id", businessIds),
    ]);
    if (announcements.error || plans.error || settings.error) return {};
    const planIdByKey = new Map((plans.data ?? []).map((p) => [p.key as string, p.id as string]));
    const list: CustomerAnnouncement[] = (announcements.data ?? []).map((a) => ({
      id: a.id,
      type: a.type,
      title: a.title,
      message: a.message,
      audienceType: a.audience_type,
      audiencePlanId: a.audience_plan_id,
      audienceBusinessId: a.audience_business_id,
      publishAt: a.publish_at,
      expireAt: a.expire_at,
      enabled: a.enabled,
    }));
    const out: Record<string, CustomerAnnouncement[]> = {};
    for (const s of settings.data ?? []) {
      out[s.business_id as string] = announcementsForBusiness(list, { id: s.business_id as string, planId: planIdByKey.get(s.plan as string) ?? null });
    }
    return out;
  } catch {
    return {};
  }
}
