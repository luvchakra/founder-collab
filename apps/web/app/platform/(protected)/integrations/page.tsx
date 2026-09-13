import { listIntegrationRegistry } from "@cofounderai/core/admin/platform-integrations";
import { PlatformImpactBanner } from "../../impact-banner";
import { IntegrationRegistryTable } from "./integration-registry-table";

/**
 * PLATFORM-P0-12.1 ("Integration Registry", docs/plan/09-PLATFORM-ADMIN-BACKLOG.md §16):
 * the platform-wide operational view of every external integration category WonderArc
 * offers -- credential ownership model, current status, and the emergency kill switch. See
 * `platform-integrations.ts` and its migration's own docstrings for what
 * `platform.integrations` is and why it's genuinely new, not a duplicate of any existing
 * per-business credential table (`crm.channel_accounts`, `gst.*_credentials`,
 * `discovery.ai_provider_credentials`, `platform.ai_provider_keys`, `platform.email_provider`).
 *
 * Desktop table / mobile card split per CLAUDE.md development principle #12 and
 * docs/design/claude-ui-design-rules.md rule 5, mirroring `modules/page.tsx`'s own
 * established split.
 */
export default async function PlatformIntegrationsPage() {
  const integrations = await listIntegrationRegistry();

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">Global Integrations</h1>
        <p className="text-sm text-zinc-400">
          Every external integration category the platform offers, and its platform-wide operational status.
        </p>
      </div>

      <PlatformImpactBanner />

      <IntegrationRegistryTable integrations={integrations} />
    </div>
  );
}
