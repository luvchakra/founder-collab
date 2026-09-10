import { notFound } from "next/navigation";
import { getBusiness } from "@cofounderai/module-discovery/lib/tenancy/queries";
import { hasPermission } from "@cofounderai/core/rbac/require-permission";
import { listApiKeys } from "@cofounderai/core/api-v1/keys/queries";
import { ApiKeysPanel } from "@cofounderai/core/api-keys/api-keys-panel";
import { Breadcrumbs } from "@cofounderai/module-discovery/components/tenancy/breadcrumbs";
import { generateApiKeyAction, revokeApiKeyAction } from "./actions";

/**
 * Moved out from underneath `/inventory/` (this session -- item #7 of a UX pass):
 * `core.api_keys`'s own RLS already gates on the business-wide `settings.manage`
 * permission (supabase/migrations/20260907210000_core_api_keys.sql), not any
 * inventory-specific check, and `@cofounderai/module-inventory/api-v1/router.ts` was
 * never the only module a key could reach either -- fsm/crm/gst now each expose their
 * own resources through the same `/api/v1/[resource]` endpoint (see each module's own
 * `api-v1/router.ts`). Nesting this page under one module's own route implied an
 * ownership that never matched the data model; this business-wide `admin/` route
 * doesn't. `getBusiness` deliberately comes from `module-discovery` (the module-
 * agnostic "bare business page" owner), not any specific module's own tenancy copy.
 */
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
      <Breadcrumbs
        items={[
          { label: "Business", href: `/dashboard/businesses/${businessId}` },
          { label: "Admin", href: "/dashboard/settings" },
          { label: "API Keys" },
        ]}
      />
      <div>
        <h1 className="text-xl font-semibold">API Keys</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage keys for the public REST API for {business.name} -- covers every licensed module&apos;s
          resources, not just one.
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
