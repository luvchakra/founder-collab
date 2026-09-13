import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowUpRight } from "lucide-react";
import { resolveBusinessIdBySlug } from "@cofounderai/core/businesses/resolve";
import { getBusiness } from "@cofounderai/module-crm/lib/tenancy/queries";
import { getPotentialLostBusinessDashboard, getCrmDashboardKpis } from "@cofounderai/module-crm/lib/dashboard/queries";
import { listCrossModuleExceptions } from "@cofounderai/module-crm/lib/exceptions/queries";
import { inr } from "@cofounderai/core/lib/format";

function KpiCard({ label, value, detail, href }: { label: string; value: string | number; detail: string; href?: string }) {
  const content = (
    <div className="flex h-full flex-col gap-1 rounded-md border p-4">
      <div className="flex items-start justify-between gap-2">
        <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{label}</span>
        {href ? (
          <ArrowUpRight className="size-3.5 shrink-0 text-muted-foreground/60 transition-colors group-hover:text-foreground" aria-hidden="true" />
        ) : null}
      </div>
      <span className="text-2xl font-semibold">{value}</span>
      <span className="text-xs text-muted-foreground">{detail}</span>
    </div>
  );
  if (!href) return content;
  return (
    <Link href={href} className="group block rounded-md transition-colors hover:border-foreground/20">
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
 *
 * CRM-14.1 adds a second section below, "Pipeline & operations" -- the backlog's own
 * nine-KPI "CRM Dashboard" (`getCrmDashboardKpis()`). Deliberately a second section on
 * this same page rather than a separate route: CRM-14.2's own "primary dashboard, not a
 * hidden report" already claimed the top-of-nav "Dashboard" slot, and these two KPI sets
 * are complementary reads of the same underlying data (what's at risk vs. what's the
 * current pipeline/operations state), not two different audiences.
 *
 * INT-07.1 adds one more card to the first section, "Open exceptions" -- the count from
 * the business-wide Cross-Module Exception Model (`listCrossModuleExceptions()`).
 * INT-07.2 gives it an `href` once the Exception Center list page exists to link to.
 */
export default async function CrmDashboardPage({ params }: { params: Promise<{ businessSlug: string }> }) {
  const { businessSlug } = await params;
  const businessId = await resolveBusinessIdBySlug(businessSlug);
  if (!businessId) notFound();
  const business = await getBusiness(businessId);
  if (!business) notFound();

  const [metrics, kpis, exceptions] = await Promise.all([
    getPotentialLostBusinessDashboard(businessId),
    getCrmDashboardKpis(businessId),
    listCrossModuleExceptions(businessId),
  ]);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-xl font-semibold">Dashboard</h1>
        <p className="mt-1 text-sm text-muted-foreground">{business.name}&apos;s potential lost business, at a glance.</p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <KpiCard
          label="Unanswered messages"
          value={metrics.unansweredMessages}
          detail="awaiting a reply"
          href={`/${businessSlug}/crm/lost-business`}
        />
        <KpiCard
          label="Unanswered social questions"
          value={metrics.unansweredSocialQuestions}
          detail="awaiting a reply"
          href={`/${businessSlug}/crm/lost-business`}
        />
        <KpiCard
          label="Reviews requiring action"
          value={metrics.unansweredReviewsRequiringAction}
          detail="new or in progress"
          href={`/${businessSlug}/crm/reviews`}
        />
        <KpiCard
          label="Overdue leads"
          value={metrics.overdueLeads}
          detail="past their follow-up date"
          href={`/${businessSlug}/crm/leads`}
        />
        <KpiCard
          label="Stale opportunities"
          value={metrics.staleOpportunities}
          detail="no activity in 14+ days"
          href={`/${businessSlug}/crm/opportunities`}
        />
        <KpiCard
          label="Open high-intent conversations"
          value={metrics.openHighIntentConversations}
          detail="pricing, availability, or purchase intent"
          href={`/${businessSlug}/crm/conversations`}
        />
        <KpiCard
          label="Open exceptions"
          value={exceptions.length}
          detail="parts shortages and assessments needing a decision"
          href={`/${businessSlug}/crm/exceptions`}
        />
      </div>

      <div>
        <h2 className="text-lg font-semibold">Pipeline &amp; operations</h2>
        <p className="mt-1 text-sm text-muted-foreground">Current pipeline state and response performance.</p>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
          <KpiCard label="New leads" value={kpis.newLeads} detail="status: new" href={`/${businessSlug}/crm/leads`} />
          <KpiCard
            label="Open opportunities"
            value={kpis.openOpportunities}
            detail="in an open stage"
            href={`/${businessSlug}/crm/opportunities`}
          />
          <KpiCard label="Pipeline value" value={inr.format(kpis.pipelineValue)} detail="open opportunities" href={`/${businessSlug}/crm/opportunities`} />
          <KpiCard label="Won value" value={inr.format(kpis.wonValue)} detail="all time" href={`/${businessSlug}/crm/opportunities`} />
          <KpiCard
            label="Open conversations"
            value={kpis.openConversations}
            detail="new, open, or waiting"
            href={`/${businessSlug}/crm/conversations`}
          />
          <KpiCard
            label="Unanswered commercial interactions"
            value={kpis.unansweredCommercialInteractions}
            detail="every channel"
            href={`/${businessSlug}/crm/lost-business`}
          />
          <KpiCard
            label="Overdue follow-ups"
            value={kpis.overdueFollowUps}
            detail="past due"
            href={`/${businessSlug}/crm/follow-ups`}
          />
          <KpiCard
            label="Quote follow-ups"
            value={kpis.quoteFollowUps}
            detail="open opportunities with an FSM quote"
            href={`/${businessSlug}/crm/opportunities`}
          />
          <KpiCard
            label="Response SLA"
            value={kpis.responseSlaPercent === null ? "--" : `${kpis.responseSlaPercent}%`}
            detail="on-time replies, last 30 days"
            href={`/${businessSlug}/crm/conversations`}
          />
        </div>
      </div>
    </div>
  );
}
