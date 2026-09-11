import {
  getConfigurationHealth,
  getPlatformOverview,
  getRecentGlobalChanges,
} from "@cofounderai/core/admin/platform-dashboard-queries";
import { moduleRegistry } from "@cofounderai/module-registry";
import { Card, CardContent, CardHeader, CardTitle } from "@cofounderai/core/ui/card";
import { Badge } from "@cofounderai/core/ui/badge";
import { formatDateTime } from "@cofounderai/core/lib/format";

/**
 * PLATFORM-P0-02: the Platform Dashboard -- overview KPIs (§6, PLATFORM-P0-02.1),
 * configuration health (PLATFORM-P0-02.2), and a recent global-changes feed
 * (PLATFORM-P0-02.3). No customer PII is shown (§6.1's "do not expose sensitive customer
 * data unnecessarily") -- every widget is a count, a sum, or a business *name*, never
 * contact details, documents, or conversation content.
 */

function KpiCard({ label, value, detail }: { label: string; value: string | number; detail?: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-md border border-zinc-800 bg-zinc-900 p-4">
      <span className="text-xs font-medium tracking-wide text-zinc-400 uppercase">{label}</span>
      <span className="text-2xl font-semibold">{value}</span>
      {detail ? <span className="text-xs text-zinc-400">{detail}</span> : null}
    </div>
  );
}

const EVENT_TYPE_LABEL: Record<string, string> = {
  activated: "activated",
  deactivated: "deactivated",
  reactivated: "reactivated",
  expired: "expired",
};

export default async function PlatformHomePage() {
  const [overview, configHealth, recentChanges] = await Promise.all([
    getPlatformOverview(),
    getConfigurationHealth(),
    getRecentGlobalChanges(),
  ]);

  const moduleBreakdown = moduleRegistry
    .map((m) => ({ label: m.name, count: overview.licensedModuleCounts[m.key] ?? 0 }))
    .filter((m) => m.count > 0);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-xl font-semibold">Platform Dashboard</h1>
        <p className="text-sm text-zinc-400">
          Aggregate, cross-tenant view of the whole platform -- no per-customer detail.
        </p>
      </div>

      <section>
        <h2 className="mb-3 text-sm font-semibold tracking-wide text-zinc-400 uppercase">Overview</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <KpiCard label="Businesses" value={overview.businessCount} />
          <KpiCard label="Active users" value={overview.activeUserCount} />
          <KpiCard
            label="Active licenses"
            value={overview.activeLicenseCount}
            detail={moduleBreakdown.length > 0 ? moduleBreakdown.map((m) => `${m.label} ${m.count}`).join(" · ") : undefined}
          />
          <KpiCard
            label="MRR / ARR"
            value="--"
            detail="Not tracked yet -- pricing plans ship in PLATFORM-P0-04"
          />
          <KpiCard
            label="AI usage (30d)"
            value={`$${overview.aiUsage30d.estimatedCostUsd.toFixed(2)}`}
            detail={`${overview.aiUsage30d.runCount} run${overview.aiUsage30d.runCount === 1 ? "" : "s"}`}
          />
          <KpiCard
            label="API usage (24h)"
            value={overview.apiUsage.requests24h}
            detail={`${overview.apiUsage.activeKeyCount} active key${overview.apiUsage.activeKeyCount === 1 ? "" : "s"}`}
          />
          <KpiCard
            label="System health"
            value={overview.openPlatformIssues === 0 ? "Operational" : "Attention needed"}
          />
          <KpiCard label="Open platform issues" value={overview.openPlatformIssues} detail="Failed events past retry" />
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold tracking-wide text-zinc-400 uppercase">
          Configuration health
        </h2>
        <Card className="border-zinc-800 bg-zinc-900 text-zinc-50">
          <CardContent className="flex flex-col divide-y divide-zinc-800 pt-4">
            {configHealth.map((item) => (
              <div key={item.key} className="flex items-center justify-between gap-3 py-2.5 text-sm first:pt-0 last:pb-0">
                <div className="min-w-0">
                  <p className="truncate font-medium">{item.label}</p>
                  <p className="truncate text-xs text-zinc-400">{item.detail}</p>
                </div>
                <Badge
                  variant={item.configured ? "default" : "outline"}
                  className={item.configured ? "shrink-0" : "shrink-0 border-zinc-700 text-zinc-300"}
                >
                  {item.configured ? "Configured" : "Not configured"}
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold tracking-wide text-zinc-400 uppercase">
          Recent global changes
        </h2>
        <Card className="border-zinc-800 bg-zinc-900 text-zinc-50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-normal text-zinc-400">
              License activity across every business, most recent first
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col divide-y divide-zinc-800">
            {recentChanges.length === 0 ? (
              <p className="py-2 text-sm text-zinc-400">No license activity yet.</p>
            ) : (
              recentChanges.map((change) => {
                const moduleLabel = moduleRegistry.find((m) => m.key === change.moduleKey)?.name ?? change.moduleKey;
                return (
                  <div key={change.id} className="flex items-center justify-between gap-3 py-2.5 text-sm first:pt-0 last:pb-0">
                    <span className="min-w-0 truncate">
                      {moduleLabel} {EVENT_TYPE_LABEL[change.eventType] ?? change.eventType} for {change.businessName}
                    </span>
                    <span className="shrink-0 text-xs text-zinc-400">{formatDateTime(change.createdAt)}</span>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
