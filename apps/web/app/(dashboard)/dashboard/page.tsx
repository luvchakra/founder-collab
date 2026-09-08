import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentAccount } from "@cofounderai/module-discovery/lib/tenancy/queries";
import {
  getAccountUsageAndProspects,
  getAccountWorkspaceEntries,
} from "@cofounderai/module-discovery/lib/dashboard/queries";
import { computeConversionFunnel } from "@cofounderai/module-discovery/lib/prospects/pipeline";
import { creditsUsedPercent } from "@cofounderai/module-discovery/lib/usage/format";
import { FREE_TIER_MONTHLY_COST_LIMIT_USD } from "@cofounderai/module-discovery/lib/usage/limits";
import { ConversionFunnelPanel } from "@cofounderai/module-discovery/components/prospects/conversion-funnel-panel";
import { listLicensesForBusiness } from "@cofounderai/core/licensing/queries";
import { ModuleIcon } from "@cofounderai/core/shell/module-icon";
import type { ModuleKey } from "@cofounderai/module-registry";
import { Button } from "@cofounderai/core/ui/button";
import { Label } from "@cofounderai/core/ui/label";
import { NativeSelect } from "@cofounderai/core/ui/native-select";
import { getOpenJobsCount } from "@cofounderai/module-fsm/lib/dashboard/queries";
import { listLowStockAlerts } from "@cofounderai/module-inventory/contract/index";
import { getOpenTicketsCount } from "@cofounderai/module-crm/lib/dashboard/queries";
import { getEinvoicesThisMonthCount } from "@cofounderai/module-gst/lib/dashboard/queries";

/** S-5: the platform dashboard's module-contributed widget row -- one card per licensed
 * non-discovery module (discovery gets its own dedicated KPI section above, unchanged;
 * this row is what "assembled from module-contributed widgets via the registry" adds).
 * Lives here, not in `packages/core`, because rendering it means importing each
 * module's own dashboard query directly -- `apps/web` is the composition root exempt
 * from the module-to-module contract-only restriction, same reasoning
 * `components/gst/gst-document-panel.tsx` (S-2) already established. A module with zero
 * licensed businesses on this account contributes nothing at all -- ADR-10's own
 * degraded mode, not an error or a placeholder card. */
async function computeModuleWidgets(businessIds: string[]): Promise<{ key: ModuleKey; label: string; icon: string; value: number; detail: string }[]> {
  if (businessIds.length === 0) return [];

  const licensesByBusiness = await Promise.all(businessIds.map((id) => listLicensesForBusiness(id)));
  const licensedBusinessIdsByModule = new Map<string, string[]>();
  licensesByBusiness.forEach((licenses, i) => {
    for (const license of licenses) {
      if (license.status !== "active" && license.status !== "grace") continue;
      const ids = licensedBusinessIdsByModule.get(license.module_key) ?? [];
      ids.push(businessIds[i]!);
      licensedBusinessIdsByModule.set(license.module_key, ids);
    }
  });

  const widgets: { key: ModuleKey; label: string; icon: string; value: number; detail: string }[] = [];

  const fsmIds = licensedBusinessIdsByModule.get("fsm") ?? [];
  if (fsmIds.length > 0) {
    const openJobs = await getOpenJobsCount(fsmIds);
    widgets.push({ key: "fsm", label: "Service", icon: "Wrench", value: openJobs, detail: "open jobs" });
  }

  const inventoryIds = licensedBusinessIdsByModule.get("inventory") ?? [];
  if (inventoryIds.length > 0) {
    const alertCounts = await Promise.all(inventoryIds.map((id) => listLowStockAlerts(id)));
    const lowStock = alertCounts.reduce((sum, r) => sum + (r.ok ? r.data.length : 0), 0);
    widgets.push({ key: "inventory", label: "Inventory", icon: "Package", value: lowStock, detail: "low-stock alerts" });
  }

  const crmIds = licensedBusinessIdsByModule.get("crm") ?? [];
  if (crmIds.length > 0) {
    const openTickets = await getOpenTicketsCount(crmIds);
    widgets.push({ key: "crm", label: "CRM", icon: "Inbox", value: openTickets, detail: "open tickets" });
  }

  const gstIds = licensedBusinessIdsByModule.get("gst") ?? [];
  if (gstIds.length > 0) {
    const einvoices = await getEinvoicesThisMonthCount(gstIds);
    widgets.push({ key: "gst", label: "GST", icon: "Receipt", value: einvoices, detail: "e-invoices this month" });
  }

  return widgets;
}

function ModuleWidgetCard({ label, icon, value, detail }: { label: string; icon: string; value: number; detail: string }) {
  return (
    <div className="flex flex-col gap-2 rounded-md border p-4">
      <div className="flex items-center gap-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
        <ModuleIcon name={icon} className="size-3.5" />
        {label}
      </div>
      <span className="text-2xl font-semibold">{value}</span>
      <span className="text-xs text-muted-foreground">{detail}</span>
    </div>
  );
}

function KpiCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: string | number;
  detail?: string;
}) {
  return (
    <div className="flex flex-col gap-1 rounded-md border p-4">
      <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
        {label}
      </span>
      <span className="text-2xl font-semibold">{value}</span>
      {detail ? <span className="text-xs text-muted-foreground">{detail}</span> : null}
    </div>
  );
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ business?: string; product?: string }>;
}) {
  const account = await getCurrentAccount();
  if (!account) redirect("/login");

  const { business: businessFilter, product: productFilter } = await searchParams;

  // Both cache()-wrapped by accountId -- when the dashboard layout already ran these for
  // this same request (it always does), this reuses that result instead of re-scanning
  // the account.
  const { businesses, allProducts, entries: workspaceEntries } = await getAccountWorkspaceEntries(
    account.id,
  );
  const { usageByWorkspace, countsByWorkspace, prospects } = await getAccountUsageAndProspects(
    account.id,
  );
  const moduleWidgets = await computeModuleWidgets(businesses.map((b) => b.id));

  const prospectCounts = Object.values(countsByWorkspace).reduce(
    (sum, c) => ({
      total: sum.total + c.total,
      new: sum.new + c.new,
      qualified: sum.qualified + c.qualified,
      disqualified: sum.disqualified + c.disqualified,
    }),
    { total: 0, new: 0, qualified: 0, disqualified: 0 },
  );
  const usage = Object.values(usageByWorkspace).reduce(
    (sum, u) => ({ runs: sum.runs + u.totalRuns, cost: sum.cost + u.totalCost }),
    { runs: 0, cost: 0 },
  );

  // Slice-and-dice: a product filter is the most specific slice, then business, then
  // every workspace on the account. No query at all here -- just filtering the
  // account's already-fetched prospect list by which workspaces are in the slice.
  const slicedEntries = productFilter
    ? workspaceEntries.filter((e) => e.product.id === productFilter)
    : businessFilter
      ? workspaceEntries.filter((e) => e.business.id === businessFilter)
      : workspaceEntries;
  const slicedWorkspaceIds = new Set(slicedEntries.map((e) => e.workspace.id));
  const slicedProspects = prospects.filter((p) => slicedWorkspaceIds.has(p.workspace_id));
  const funnel = computeConversionFunnel(slicedProspects);
  const wonCount = slicedProspects.filter((p) => p.outcome === "won").length;

  const productsForFilter = businessFilter
    ? workspaceEntries.filter((e) => e.business.id === businessFilter)
    : workspaceEntries;

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-8">
      <section>
        <h1 className="text-xl font-semibold">Overview</h1>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <KpiCard label="Businesses" value={businesses.length} />
          <KpiCard label="Products" value={allProducts.length} />
          <KpiCard
            label="Prospects"
            value={prospectCounts.total}
            detail={
              prospectCounts.total > 0
                ? `${prospectCounts.qualified} qualified · ${prospectCounts.new} new`
                : undefined
            }
          />
          <KpiCard
            label="AI credits (month)"
            value={`${creditsUsedPercent(usage.cost, FREE_TIER_MONTHLY_COST_LIMIT_USD * Math.max(workspaceEntries.length, 1))}%`}
            detail={`${usage.runs} run${usage.runs === 1 ? "" : "s"} used`}
          />
        </div>
      </section>

      {moduleWidgets.length > 0 ? (
        <section>
          <h2 className="text-xl font-semibold">Modules</h2>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {moduleWidgets.map((widget) => (
              <ModuleWidgetCard key={widget.key} label={widget.label} icon={widget.icon} value={widget.value} detail={widget.detail} />
            ))}
          </div>
        </section>
      ) : null}

      <section className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-semibold">Conversions</h2>
          <form method="get" className="flex flex-wrap items-end gap-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="business">Business</Label>
              <NativeSelect id="business" name="business" defaultValue={businessFilter ?? ""}>
                <option value="">All businesses</option>
                {businesses.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="product">Product</Label>
              <NativeSelect id="product" name="product" defaultValue={productFilter ?? ""}>
                <option value="">All products</option>
                {productsForFilter.map((e) => (
                  <option key={e.product.id} value={e.product.id}>
                    {e.product.name}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <Button type="submit" size="sm" variant="outline">
              Apply
            </Button>
            {businessFilter || productFilter ? (
              <Button asChild size="sm" variant="ghost">
                <Link href="/dashboard">Clear</Link>
              </Button>
            ) : null}
          </form>
        </div>

        {workspaceEntries.length === 0 ? (
          <p className="text-muted-foreground">
            Use the business switcher in the sidebar to create your first business and
            start building a GTM workspace for a product.
          </p>
        ) : (
          <ConversionFunnelPanel funnel={funnel} wonCount={wonCount} />
        )}
      </section>
    </main>
  );
}
