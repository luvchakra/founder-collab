import Link from "next/link";
import { notFound } from "next/navigation";
import { getBusiness } from "@cofounderai/module-crm/lib/tenancy/queries";
import { getPotentialLostBusinessDashboard } from "@cofounderai/module-crm/lib/dashboard/queries";

function KpiCard({ label, value, detail, href }: { label: string; value: number; detail: string; href?: string }) {
  const content = (
    <div className="flex h-full flex-col gap-1 rounded-md border p-4">
      <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{label}</span>
      <span className="text-2xl font-semibold">{value}</span>
      <span className="text-xs text-muted-foreground">{detail}</span>
    </div>
  );
  if (!href) return content;
  return (
    <Link href={href} className="block transition-colors hover:border-foreground/20 rounded-md">
      {content}
    </Link>
  );
}

/**
 * CRM-14.2's "Potential Lost Business Dashboard" -- "a primary dashboard, not a hidden
 * report," hence its own top-of-nav "Dashboard" item rather than folding into an
 * existing page. Distinct from CRM-09.2's "Potential Lost Business" queue (a worklist of
 * individual interactions to act on one at a time): this is the aggregate view, six KPI
 * counts a founder should be able to read at a glance. `unansweredSocialQuestions` and
 * `unansweredReviewsRequiringAction` read real (if currently always-zero) counts against
 * schema CRM-08.x already anticipated -- not placeholders, just channels nothing writes
 * to yet (CRM-08.2/08.3/08.5, P1, not built).
 */
export default async function CrmDashboardPage({ params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params;
  const business = await getBusiness(businessId);
  if (!business) notFound();

  const metrics = await getPotentialLostBusinessDashboard(businessId);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">Dashboard</h1>
        <p className="mt-1 text-sm text-muted-foreground">{business.name}&apos;s potential lost business, at a glance.</p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <KpiCard
          label="Unanswered messages"
          value={metrics.unansweredMessages}
          detail="awaiting a reply"
          href={`/dashboard/businesses/${businessId}/crm/lost-business`}
        />
        <KpiCard
          label="Unanswered social questions"
          value={metrics.unansweredSocialQuestions}
          detail="awaiting a reply"
          href={`/dashboard/businesses/${businessId}/crm/lost-business`}
        />
        <KpiCard label="Reviews requiring action" value={metrics.unansweredReviewsRequiringAction} detail="new or in progress" />
        <KpiCard
          label="Overdue leads"
          value={metrics.overdueLeads}
          detail="past their follow-up date"
          href={`/dashboard/businesses/${businessId}/crm/leads`}
        />
        <KpiCard
          label="Stale opportunities"
          value={metrics.staleOpportunities}
          detail="no activity in 14+ days"
          href={`/dashboard/businesses/${businessId}/crm/opportunities`}
        />
        <KpiCard
          label="Open high-intent conversations"
          value={metrics.openHighIntentConversations}
          detail="pricing, availability, or purchase intent"
          href={`/dashboard/businesses/${businessId}/crm/conversations`}
        />
      </div>
    </div>
  );
}
