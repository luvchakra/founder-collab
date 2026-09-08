import { notFound } from "next/navigation";
import { getBusiness } from "@cofounderai/module-inventory/lib/tenancy/queries";
import { hasPermission } from "@cofounderai/core/rbac/require-permission";
import { listApiKeys } from "@cofounderai/core/api-v1/keys/queries";
import { ApiKeysPanel } from "@cofounderai/module-inventory/components/api-keys/api-keys-panel";
import { generateApiKeyAction, revokeApiKeyAction } from "./actions";

/** Ported from stockpilot-ai-ops's own "API keys" card in Organization Settings
 * (src/routes/_authenticated/account.tsx) -- promoted to its own page under
 * INVENTORY_NAV's "Administration" group alongside Team, since settings.manage (C-7) is
 * itself an inventory-module permission on this platform, not a generic business-wide
 * one. */
export default async function ApiKeysPage({
  params,
}: {
  params: Promise<{ businessId: string }>;
}) {
  const { businessId } = await params;
  const business = await getBusiness(businessId);
  if (!business) notFound();

  const canManage = await hasPermission(businessId, "settings.manage");

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">API Keys</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage keys for the public REST API for {business.name}.
        </p>
      </div>

      {canManage ? (
        <ApiKeysPanel
          keys={await listApiKeys(businessId)}
          generateAction={generateApiKeyAction.bind(null, businessId)}
          revokeAction={revokeApiKeyAction.bind(null, businessId)}
        />
      ) : (
        <p className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-sm text-muted-foreground">
          You don&apos;t have permission to manage API keys for this business.
        </p>
      )}
    </div>
  );
}
