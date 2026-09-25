import Link from "next/link";
import { Mail, Plus } from "lucide-react";
import { PageHeader } from "@cofounderai/core/ui/page-header";
import { Button } from "@cofounderai/core/ui/button";
import { Card, CardContent } from "@cofounderai/core/ui/card";
import { EmptyState } from "@cofounderai/core/ui/empty-state";
import { listOutreach } from "@cofounderai/module-discovery/lib/funding/queries";
import { OUTREACH_STATUSES, OUTREACH_STATUS_LABEL, type OutreachStatus } from "@cofounderai/module-discovery/lib/funding/types";
import { UrlSelect } from "@cofounderai/module-discovery/components/marketing/url-select";
import { OutreachBadge } from "@cofounderai/module-discovery/components/funding/status";
import { fundingContext } from "../context";

/** FND-11 — Investor outreach (§27): drafts, approvals and what was sent. Nothing is sent
 * to an investor without someone approving it and then pressing Send. */
export default async function OutreachPage({
  params,
  searchParams,
}: {
  params: Promise<{ businessSlug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ businessSlug }, sp] = await Promise.all([params, searchParams]);
  const { businessId, root, canView, canManage } = await fundingContext(businessSlug);
  if (!canView) return null;
  const status = (OUTREACH_STATUSES as readonly string[]).includes(String(sp.status)) ? (sp.status as OutreachStatus) : undefined;
  const drafts = await listOutreach(businessId, { status });

  return (
    <>
      <PageHeader
        title="Investor outreach"
        description="Research → draft → approval → send → response. Sending is always a person's decision."
        actions={
          canManage ? (
            <Button asChild size="sm">
              <Link href={`${root}/outreach/new`}>
                <Plus className="size-4" aria-hidden="true" /> New draft
              </Link>
            </Button>
          ) : null
        }
      />
      <div className="max-w-xs">
        <UrlSelect
          name="status"
          label="Status"
          value={status ?? ""}
          options={[{ value: "", label: "All" }, ...OUTREACH_STATUSES.map((s) => ({ value: s, label: OUTREACH_STATUS_LABEL[s] }))]}
        />
      </div>
      <Card>
        <CardContent className="pt-6">
          {drafts.length === 0 ? (
            <EmptyState icon={Mail} message={status ? "Nothing with that status." : "No outreach yet."} />
          ) : (
            <ul className="divide-y">
              {drafts.map((d) => (
                <li key={d.id}>
                  <Link href={`${root}/outreach/${d.id}`} className="flex flex-col gap-1 py-3 hover:bg-accent/30 sm:flex-row sm:items-center sm:justify-between sm:px-2">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{d.subject}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {d.investorName ?? "Investor"}
                        {d.origin === "ai_draft" ? " · AI draft" : ""}
                        {d.sentAt ? ` · sent ${new Date(d.sentAt).toLocaleString("en-IN")}` : ` · updated ${d.updatedAt.slice(0, 10)}`}
                      </p>
                    </div>
                    <OutreachBadge status={d.status} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </>
  );
}
