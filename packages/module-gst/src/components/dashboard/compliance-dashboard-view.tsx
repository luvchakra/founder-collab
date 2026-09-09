import Link from "next/link";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@cofounderai/core/ui/card";
import { Button } from "@cofounderai/core/ui/button";
import { Badge } from "@cofounderai/core/ui/badge";
import { BreakdownBars } from "@cofounderai/core/ui/breakdown-bars";
import { inr } from "@cofounderai/core/lib/format";
import type { ComplianceDashboard } from "../../lib/dashboard/types";

function KpiCard({ label, value, detail }: { label: string; value: string | number; detail?: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-md border p-4">
      <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{label}</span>
      <span className="text-2xl font-semibold">{value}</span>
      {detail ? <span className="text-xs text-muted-foreground">{detail}</span> : null}
    </div>
  );
}

/** `/gst`'s new dashboard -- KPIs + a collected-tax breakdown for the current month,
 * plus quick links into the four working pages (Profile, e-Way Bill, e-Invoicing,
 * Filing). Same KPI-card + BreakdownBars visual language the discovery/inventory/fsm
 * dashboards already use. */
export function ComplianceDashboardView({ businessId, data }: { businessId: string; data: ComplianceDashboard }) {
  const base = `/dashboard/businesses/${businessId}/gst`;
  const collectedBreakdown = [
    { key: "cgst", label: "CGST", value: data.cgstCollected },
    { key: "sgst", label: "SGST", value: data.sgstCollected },
    { key: "igst", label: "IGST", value: data.igstCollected },
  ];

  return (
    <div className="flex flex-col gap-4 lg:gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {data.gstin ? (
          <Badge variant="outline" className="gap-1.5">
            <CheckCircle2 className="size-3.5 text-primary" aria-hidden="true" />
            GSTIN {data.gstin}
          </Badge>
        ) : (
          <Badge variant="destructive" className="gap-1.5">
            <AlertTriangle className="size-3.5" aria-hidden="true" />
            GST profile not set up
          </Badge>
        )}
        <div className="flex flex-wrap gap-2">
          <Button asChild size="sm" variant="outline">
            <Link href={`${base}/profile`}>GST Profile</Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href={`${base}/eway-bill`}>e-Way Bill</Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href={`${base}/einvoicing`}>e-Invoicing</Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href={`${base}/filing`}>GST Filing</Link>
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiCard label="Payable (month)" value={inr.format(data.payableThisMonth)} detail="input tax credit" />
        <KpiCard label="Collected (month)" value={inr.format(data.collectedThisMonth)} detail="output tax" />
        <KpiCard label="e-Invoices (month)" value={data.einvoicesThisMonth} />
        <KpiCard
          label="GSTIN risk"
          value={data.riskCount}
          detail={data.riskCount > 0 ? "missing/invalid this month" : "none this month"}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Collected tax, this month</CardTitle>
          </CardHeader>
          <CardContent>
            <BreakdownBars items={collectedBreakdown} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">e-Invoicing &amp; e-Way Bill setup</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">e-Invoice GSP credentials</span>
              <Badge variant={data.einvoiceConfigured ? "outline" : "secondary"}>
                {data.einvoiceConfigured ? "Configured" : "Not set up"}
              </Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">e-Way Bill GSP credentials</span>
              <Badge variant={data.ewayBillConfigured ? "outline" : "secondary"}>
                {data.ewayBillConfigured ? "Configured" : "Not set up"}
              </Badge>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
