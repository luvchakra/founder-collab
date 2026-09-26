// EXP-ADMIN-03 -- Integrations registry export.
import { listIntegrationRegistry, type IntegrationRegistryEntry } from "@cofounderai/core/admin/platform-integrations";
import type { PlatformExportAdapter } from "@cofounderai/core/exports/platform";

const STATUS_LABEL: Record<string, string> = {
  connected: "Connected",
  disconnected: "Disconnected",
  error: "Error",
  needs_reauthorization: "Needs reauthorization",
  disabled: "Disabled",
};
const OWNERSHIP_LABEL: Record<string, string> = {
  platform_owned: "Platform-owned",
  customer_owned: "Customer-owned",
  both: "Both",
};

/** Registry metadata only -- which integrations exist, who owns their credentials, their
 * status. listIntegrationRegistry reads no credential material, and neither does this. */
export const platformIntegrationsExport: PlatformExportAdapter<Record<string, never>> = {
  id: "platform.integrations",
  parseFilters: () => ({}),
  async load() {
    const rows = await listIntegrationRegistry();
    return {
      module: "platform",
      resource: "integrations",
      title: "Integrations",
      sheets: [
        {
          sheetName: "Integrations",
          columns: [
            { key: "name", header: "Integration", getValue: (r: IntegrationRegistryEntry) => r.displayName },
            { key: "key", header: "Category", getValue: (r: IntegrationRegistryEntry) => r.integrationKey },
            { key: "ownership", header: "Credential ownership", getValue: (r: IntegrationRegistryEntry) => OWNERSHIP_LABEL[r.credentialOwnership] ?? r.credentialOwnership },
            { key: "status", header: "Status", getValue: (r: IntegrationRegistryEntry) => STATUS_LABEL[r.status] ?? r.status },
            { key: "enabled", header: "Enabled", type: "boolean", getValue: (r: IntegrationRegistryEntry) => r.enabled },
            { key: "failing", header: "Failure state", getValue: (r: IntegrationRegistryEntry) => (r.status === "error" || r.status === "needs_reauthorization" ? STATUS_LABEL[r.status] : "") },
            { key: "updatedAt", header: "Last updated", type: "datetime", getValue: (r: IntegrationRegistryEntry) => r.updatedAt },
          ],
          rows,
        },
      ],
    };
  },
};
