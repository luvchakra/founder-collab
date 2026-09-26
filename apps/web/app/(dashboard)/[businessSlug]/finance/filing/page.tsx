import { notFound } from "next/navigation";
import { resolveBusinessIdBySlug } from "@cofounderai/core/businesses/resolve";
import { getBusiness } from "@cofounderai/module-gst/lib/tenancy/queries";
import {
  getBusinessGstFilingProfile,
  getPurchaseRegister,
  getSalesRegister,
} from "@cofounderai/module-gst/lib/filing/queries";
import { GstFilingView } from "@cofounderai/module-gst/components/filing/gst-filing-view";
import { ExportMenu } from "@cofounderai/core/export-ui/export-menu";

function currentPeriod(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function periodBounds(period: string): { start: string; end: string } {
  const [yearStr, monthStr] = period.split("-");
  const year = Number(yearStr) || new Date().getFullYear();
  const month = Number(monthStr) || new Date().getMonth() + 1;
  const start = `${period}-01`;
  const endDate = new Date(year, month, 0).getDate();
  const end = `${period}-${String(endDate).padStart(2, "0")}`;
  return { start, end };
}

export default async function GstFilingPage({
  params,
  searchParams,
}: {
  params: Promise<{ businessSlug: string }>;
  searchParams: Promise<{ period?: string }>;
}) {
  const { businessSlug } = await params;
  const businessId = await resolveBusinessIdBySlug(businessSlug);
  if (!businessId) notFound();
  const { period: periodParam } = await searchParams;
  const business = await getBusiness(businessId);
  if (!business) notFound();

  const period = periodParam || currentPeriod();
  const { start, end } = periodBounds(period);

  const [profile, purchaseRegister, salesRegister] = await Promise.all([
    getBusinessGstFilingProfile(businessId),
    getPurchaseRegister(businessId, start, end),
    getSalesRegister(businessId, start, end),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">GST Filing</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Purchase register (inward) and sales register (outward) for {business.name}&apos;s monthly GST filing.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <ExportMenu exportId="finance.filing" businessSlug={businessSlug} params={{ period }} kind="report" />
        </div>
      </div>

      <GstFilingView
        businessName={business.name}
        period={period}
        gstin={profile.gstin}
        gstRegistrationType={profile.gst_registration_type}
        purchaseRegister={purchaseRegister}
        salesRegister={salesRegister}
      />
    </div>
  );
}
