import { createClient } from "../../db/server";
import { createClient as createCoreClient } from "@cofounderai/core/db/server";
import { listEventsForRange } from "../events/queries";
import { listInvoices } from "../invoices/queries";
import { listOpportunities } from "../opportunities/queries";
import type { DispatcherDashboard } from "./types";

function coreClient() {
  return createCoreClient({ schema: "core" });
}

/** `/fsm`'s own dispatcher dashboard (PRD §5, the module's root route -- previously
 * missing entirely; docs/testing/EXECUTION-2026-09-08.md finding 6): "today's schedule,
 * unassigned queue, jobs in progress, overdue invoices, estimates awaiting response,"
 * verbatim. Reuses each list page's own already-tested query rather than duplicating
 * their join-in-JS logic -- this just narrows/filters what each already returns, same
 * reasoning `listMyEventsForRange` already applies to `listEventsForRange`. */
export async function getDispatcherDashboard(businessId: string): Promise<DispatcherDashboard> {
  const supabase = await createClient();

  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setUTCHours(0, 0, 0, 0);
  const todayEnd = new Date(todayStart);
  todayEnd.setUTCDate(todayEnd.getUTCDate() + 1);

  const [todaysEvents, unassignedJobsRes, jobsInProgressRes, invoices, opportunities] = await Promise.all([
    listEventsForRange(businessId, todayStart.toISOString(), todayEnd.toISOString()),
    supabase.from("jobs").select("*").eq("business_id", businessId).eq("status", "unscheduled").order("created_at", { ascending: false }),
    supabase.from("jobs").select("*").eq("business_id", businessId).eq("status", "in_progress").order("created_at", { ascending: false }),
    listInvoices(businessId),
    listOpportunities(businessId),
  ]);
  if (unassignedJobsRes.error) throw unassignedJobsRes.error;
  if (jobsInProgressRes.error) throw jobsInProgressRes.error;

  const [unassignedJobs, jobsInProgress] = await Promise.all([
    attachPartyNames(businessId, unassignedJobsRes.data),
    attachPartyNames(businessId, jobsInProgressRes.data),
  ]);

  const todayIso = todayStart.toISOString().slice(0, 10);
  const overdueInvoices = invoices.filter(
    (i) => i.status !== "voided" && i.status !== "paid" && i.due_date !== null && i.due_date < todayIso && i.balance_amount > 0,
  );
  const estimatesAwaitingResponse = opportunities.filter((o) => o.status === "estimate_sent");

  return { todaysEvents, unassignedJobs, jobsInProgress, overdueInvoices, estimatesAwaitingResponse };
}

/** Same "no PostgREST embed, join in JS" pattern `jobs/queries.ts#listJobs` already
 * uses -- duplicated narrowly here rather than imported, since that function selects
 * every job for the business (no status filter) and this dashboard needs two much
 * smaller, differently-filtered slices. */
async function attachPartyNames<T extends { party_id: string }>(businessId: string, jobs: T[]): Promise<(T & { party_name: string })[]> {
  if (jobs.length === 0) return [];
  const core = await coreClient();
  const partyIds = [...new Set(jobs.map((j) => j.party_id))];
  const { data: parties, error } = await core.from("parties").select("id, name").in("id", partyIds);
  if (error) throw error;
  const partyById = new Map(parties.map((p) => [p.id, p.name]));
  return jobs.map((j) => ({ ...j, party_name: partyById.get(j.party_id) ?? "Unknown customer" }));
}

/** S-5's own registry-driven dashboard: an open-job count across every business the
 * caller already knows has `fsm` licensed (the platform dashboard's own job -- this
 * function trusts the caller's license filtering, same as
 * `module-discovery/lib/usage/queries.ts#getWorkspaceUsageForWorkspaces` trusts its own
 * caller's pre-resolved workspace id list). "Open" = not completed/cancelled. */
export async function getOpenJobsCount(businessIds: string[]): Promise<number> {
  if (businessIds.length === 0) return 0;
  const supabase = await createClient();
  const { count, error } = await supabase
    .from("jobs")
    .select("id", { count: "exact", head: true })
    .in("business_id", businessIds)
    .not("status", "in", "(completed,cancelled)");
  if (error) throw error;
  return count ?? 0;
}
