import Link from "next/link";
import { notFound } from "next/navigation";
import { resolveBusinessIdBySlug } from "@cofounderai/core/businesses/resolve";
import { hasPermission } from "@cofounderai/core/rbac/require-permission";
import { PageHeader } from "@cofounderai/core/ui/page-header";
import { cn } from "@cofounderai/core/lib/utils";
import { getFiscalContext, isIsoDate } from "@cofounderai/module-gst/exports/periods";
import { fiscalYearLabel, monthlyPeriodsForFiscalYear } from "@cofounderai/module-gst/lib/accounting/periods";
import { getDimensionReport, getDimensionSettings } from "@cofounderai/module-gst/lib/dimensions/queries";
import { isDimensionKey, type DimensionKey } from "@cofounderai/module-gst/lib/dimensions/derive";
import { DimensionSettingsForm } from "@cofounderai/module-gst/components/dimensions/dimension-settings-form";
import { DimensionReport, DimensionTabs } from "@cofounderai/module-gst/components/dimensions/dimension-report";
import { ReportPeriodCaption } from "@cofounderai/module-gst/components/accounting/financial-statements";
import { saveDimensionSettingsAction } from "./actions";

/**
 * FIN-9 — dimensions (§29): profit and loss by customer/supplier, product/service,
 * location or project, for the dimensions this business switched on. None is ever
 * mandatory; untagged lines report as "Unassigned" so every tab adds up to the whole P&L.
 */
export default async function FinanceDimensionsPage({
  params,
  searchParams,
}: {
  params: Promise<{ businessSlug: string }>;
  searchParams: Promise<{ dimension?: string; from?: string; to?: string }>;
}) {
  const { businessSlug } = await params;
  const { dimension: dimensionParam, from: fromParam, to: toParam } = await searchParams;
  const businessId = await resolveBusinessIdBySlug(businessSlug);
  if (!businessId) notFound();

  const [settings, canManage, fiscal] = await Promise.all([
    getDimensionSettings(businessId),
    hasPermission(businessId, "gst.dimensions.manage"),
    getFiscalContext(businessId),
  ]);
  const { fiscalYear, fiscalYearStartMonth, year, thisMonth, label } = fiscal;
  const from = isIsoDate(fromParam) ? fromParam : year[0]!.startDate;
  const to = isIsoDate(toParam) ? toParam : thisMonth.endDate;

  const enabled = settings.filter((s) => s.enabled);
  const active: DimensionKey | null =
    dimensionParam && isDimensionKey(dimensionParam) && enabled.some((s) => s.key === dimensionParam)
      ? dimensionParam
      : (enabled[0]?.key ?? null);
  const rows = active ? await getDimensionReport(businessId, active, from, to) : [];

  const basePath = `/${businessSlug}/finance/dimensions`;
  const href = (next: { dimension?: DimensionKey; from?: string; to?: string }) =>
    `${basePath}?dimension=${next.dimension ?? active ?? ""}&from=${next.from ?? from}&to=${next.to ?? to}`;
  const lastYear = monthlyPeriodsForFiscalYear(fiscalYear - 1, fiscalYearStartMonth);
  const presets = [
    { label: "This month", from: thisMonth.startDate, to: thisMonth.endDate },
    { label: `${label} to date`, from: year[0]!.startDate, to: thisMonth.endDate },
    { label: fiscalYearLabel(fiscalYear - 1, fiscalYearStartMonth), from: lastYear[0]!.startDate, to: lastYear[11]!.endDate },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Dimensions"
        description="Slice your profit and loss by customer, product, location or project — only the ones you switch on."
      />

      {active ? (
        <div className="flex flex-col gap-3">
          <DimensionTabs settings={enabled} active={active} hrefFor={(key) => href({ dimension: key })} />
          <div className="flex flex-wrap items-center gap-2">
            {presets.map((preset) => {
              const current = preset.from === from && preset.to === to;
              return (
                <Link
                  key={preset.label}
                  href={href({ from: preset.from, to: preset.to })}
                  className={cn(
                    "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                    current ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground",
                  )}
                >
                  {preset.label}
                </Link>
              );
            })}
            <ReportPeriodCaption from={from} to={to} />
          </div>
          <DimensionReport label={enabled.find((s) => s.key === active)!.label} rows={rows} />
        </div>
      ) : (
        <p className="rounded-2xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
          No dimensions are switched on yet{canManage ? " — choose the ones you use below." : "."}
        </p>
      )}

      {canManage ? <DimensionSettingsForm settings={settings} action={saveDimensionSettingsAction.bind(null, businessId)} /> : null}
    </div>
  );
}
