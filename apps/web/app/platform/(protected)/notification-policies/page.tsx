import { getNotificationPolicies } from "@cofounderai/core/admin/platform-notification-policies";
import { NotificationPoliciesForm } from "./notification-policies-form";

/**
 * PLATFORM-P0-11.3 ("Notification Policies", docs/plan/09-PLATFORM-ADMIN-PORTAL-BACKLOG.md
 * §15) -- CONFIG-ONLY. See `platform-notification-policies.ts` and this feature's migration
 * for the entity-ownership reasoning (distinct from the not-yet-built
 * `core.notifications`/`core.notification_prefs` pair) and for why no real notification
 * ever reads these three toggles yet.
 *
 * A single settings surface, not a list of rows -- singleton `platform.
 * notification_policies`, same shape as `/platform/email-provider` (no table/mobile-card
 * split needed per CLAUDE.md development principle #12).
 */
export default async function PlatformNotificationPoliciesPage() {
  const policies = await getNotificationPolicies();

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">Notification Policies</h1>
        <p className="text-sm text-zinc-400">
          Platform-wide default channels -- configuration only. No in-app or push notification delivery exists yet in
          this codebase, and email is not wired to these toggles.
        </p>
      </div>

      <NotificationPoliciesForm policies={policies} />
    </div>
  );
}
