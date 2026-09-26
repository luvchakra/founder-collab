// EXP-ADMIN-07 -- Announcements, feature flags and notification policies exports.
import { listAnnouncements, type Announcement } from "@cofounderai/core/admin/platform-announcements";
import { listFeatureFlags, type FeatureFlag } from "@cofounderai/core/admin/platform-feature-flags";
import { getNotificationPolicies, type NotificationPolicies } from "@cofounderai/core/admin/platform-notification-policies";
import type { PlatformExportAdapter } from "@cofounderai/core/exports/platform";

const TYPE_LABEL: Record<string, string> = { information: "Information", warning: "Warning", maintenance: "Maintenance", critical: "Critical" };
const AUDIENCE_LABEL: Record<string, string> = {
  all_customers: "All customers",
  all_users: "All users",
  specific_plan: "Specific plan",
  specific_country: "Specific country",
};
const SCOPE_LABEL: Record<string, string> = { global: "Global", plan: "Plan", module: "Module", country: "Country" };

/** Configuration metadata only, three separate exports for three separate pages. None of
 * these records holds a credential, webhook secret or key; nothing else is read. */
export const platformAnnouncementsExport: PlatformExportAdapter<Record<string, never>> = {
  id: "platform.announcements",
  parseFilters: () => ({}),
  async load() {
    const rows = await listAnnouncements();
    return {
      module: "platform",
      resource: "announcements",
      title: "Announcements",
      sheets: [
        {
          sheetName: "Announcements",
          columns: [
            { key: "title", header: "Title", getValue: (a: Announcement) => a.title },
            { key: "type", header: "Type", getValue: (a: Announcement) => TYPE_LABEL[a.type] ?? a.type },
            { key: "enabled", header: "Enabled", type: "boolean", getValue: (a: Announcement) => a.enabled },
            {
              key: "audience",
              header: "Audience",
              getValue: (a: Announcement) =>
                a.audienceType === "specific_plan"
                  ? `Plan: ${a.audiencePlan?.name ?? ""}`
                  : a.audienceType === "specific_country"
                    ? `Country: ${a.audienceCountryCode ?? ""}`
                    : (AUDIENCE_LABEL[a.audienceType] ?? a.audienceType),
            },
            { key: "publishAt", header: "Publish at", type: "datetime", getValue: (a: Announcement) => a.publishAt },
            { key: "expireAt", header: "Expire at", type: "datetime", getValue: (a: Announcement) => a.expireAt },
            { key: "maintenanceStart", header: "Maintenance start", type: "datetime", getValue: (a: Announcement) => a.maintenanceStart },
            { key: "maintenanceEnd", header: "Maintenance end", type: "datetime", getValue: (a: Announcement) => a.maintenanceEnd },
            { key: "modules", header: "Affected modules", getValue: (a: Announcement) => a.affectedModules },
            { key: "message", header: "Message", getValue: (a: Announcement) => a.message },
            { key: "updatedAt", header: "Last updated", type: "datetime", getValue: (a: Announcement) => a.updatedAt },
          ],
          rows,
        },
      ],
    };
  },
};

export const platformFeatureFlagsExport: PlatformExportAdapter<Record<string, never>> = {
  id: "platform.feature-flags",
  parseFilters: () => ({}),
  async load() {
    const rows = await listFeatureFlags();
    return {
      module: "platform",
      resource: "feature-flags",
      title: "Feature flags",
      sheets: [
        {
          sheetName: "Feature flags",
          columns: [
            { key: "key", header: "Feature", getValue: (f: FeatureFlag) => f.featureKey },
            { key: "description", header: "Description", getValue: (f: FeatureFlag) => f.description },
            { key: "enabled", header: "Enabled", type: "boolean", getValue: (f: FeatureFlag) => f.enabled },
            { key: "scope", header: "Scope", getValue: (f: FeatureFlag) => SCOPE_LABEL[f.scopeType] ?? f.scopeType },
            {
              key: "target",
              header: "Scope target",
              getValue: (f: FeatureFlag) => f.scopePlan?.name ?? f.scopeModule?.name ?? f.scopeCountryCode ?? "",
            },
            { key: "from", header: "Effective from", type: "datetime", getValue: (f: FeatureFlag) => f.effectiveFrom },
            { key: "to", header: "Effective to", type: "datetime", getValue: (f: FeatureFlag) => f.effectiveTo },
            { key: "updatedAt", header: "Last updated", type: "datetime", getValue: (f: FeatureFlag) => f.updatedAt },
          ],
          rows,
        },
      ],
    };
  },
};

type PolicyRow = { channel: string; enabled: boolean; updatedAt: string };

export const platformNotificationPoliciesExport: PlatformExportAdapter<Record<string, never>> = {
  id: "platform.notification-policies",
  parseFilters: () => ({}),
  async load() {
    const policies: NotificationPolicies = await getNotificationPolicies();
    const rows: PolicyRow[] = [
      { channel: "Email", enabled: policies.emailEnabled, updatedAt: policies.updatedAt },
      { channel: "In-app", enabled: policies.inAppEnabled, updatedAt: policies.updatedAt },
      { channel: "Push", enabled: policies.pushEnabled, updatedAt: policies.updatedAt },
    ];
    return {
      module: "platform",
      resource: "notification-policies",
      title: "Notification policies",
      sheets: [
        {
          sheetName: "Notification policies",
          columns: [
            { key: "channel", header: "Channel", getValue: (r: PolicyRow) => r.channel },
            { key: "enabled", header: "Enabled", type: "boolean", getValue: (r: PolicyRow) => r.enabled },
            { key: "updatedAt", header: "Last updated", type: "datetime", getValue: (r: PolicyRow) => r.updatedAt },
          ],
          rows,
        },
      ],
    };
  },
};
