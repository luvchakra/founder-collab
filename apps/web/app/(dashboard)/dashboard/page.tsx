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
import { Button } from "@cofounderai/core/ui/button";
import { Label } from "@cofounderai/core/ui/label";
import { NativeSelect } from "@cofounderai/module-discovery/components/ui/native-select";

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
