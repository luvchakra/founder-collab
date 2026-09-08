import { createAdminClient as createCoreAdminClient } from "@cofounderai/core/db/admin";
import { getDocumentBalance } from "@cofounderai/core/payments/queries";
import { resolveCenterToken } from "../portal-tokens/tokens";
import type { CenterDocumentItem, CenterUpcomingItem, CustomerCenterView } from "./types";

/** The center page's one read -- resolved entirely through the token (no session), same
 * pattern as `getPublicEstimateView`/`getPublicInvoiceView`. Unlike those, this token is
 * party-scoped rather than document-scoped, so every query here filters by `party_id`
 * directly instead of a single document id. */
export async function getCustomerCenterView(rawToken: string): Promise<CustomerCenterView> {
  const token = await resolveCenterToken(rawToken);
  const core = createCoreAdminClient({ schema: "core" });
  const fsm = createCoreAdminClient({ schema: "fsm" });

  const [{ data: business }, { data: party }, { data: docs, error: docsError }, { data: jobs }, { data: opportunities }] = await Promise.all([
    core.from("businesses").select("name, website").eq("id", token.businessId).maybeSingle(),
    core.from("parties").select("name").eq("id", token.partyId).maybeSingle(),
    core
      .from("documents")
      .select("id, doc_type, number, status, total_amount, created_at")
      .eq("business_id", token.businessId)
      .eq("party_id", token.partyId)
      .eq("source_module", "fsm")
      .in("doc_type", ["estimate", "invoice"])
      .order("created_at", { ascending: false }),
    fsm.from("jobs").select("id, number, status").eq("business_id", token.businessId).eq("party_id", token.partyId),
    fsm.from("opportunities").select("id, number, status").eq("business_id", token.businessId).eq("party_id", token.partyId),
  ]);
  if (docsError) throw docsError;

  const balances = await Promise.all((docs ?? []).map((d) => getDocumentBalance(d.id)));
  const balanceByDocId = new Map(balances.filter((b) => b !== null).map((b) => [b!.document_id, b!.balance_amount]));

  const toItem = (d: (typeof docs)[number]): CenterDocumentItem => ({
    id: d.id,
    doc_type: d.doc_type as "estimate" | "invoice",
    number: d.number,
    status: d.status,
    total_amount: Number(d.total_amount),
    balance_amount: balanceByDocId.get(d.id) ?? Number(d.total_amount),
    created_at: d.created_at,
  });

  const estimates = (docs ?? []).filter((d) => d.doc_type === "estimate").map(toItem);
  const invoices = (docs ?? []).filter((d) => d.doc_type === "invoice").map(toItem);

  const jobIds = (jobs ?? []).map((j) => j.id);
  const opportunityIds = (opportunities ?? []).map((o) => o.id);
  const jobNumberById = new Map((jobs ?? []).map((j) => [j.id, j.number]));
  const opportunityNumberById = new Map((opportunities ?? []).map((o) => [o.id, o.number]));

  let upcoming: CenterUpcomingItem[] = [];
  if (jobIds.length > 0 || opportunityIds.length > 0) {
    const orFilter = [jobIds.length ? `job_id.in.(${jobIds.join(",")})` : null, opportunityIds.length ? `opportunity_id.in.(${opportunityIds.join(",")})` : null]
      .filter(Boolean)
      .join(",");
    const { data: events, error: eventsError } = await fsm
      .from("events")
      .select("id, job_id, opportunity_id, starts_at, arrival_window_start, arrival_window_end, status")
      .eq("business_id", token.businessId)
      .or(orFilter)
      .not("status", "in", "(cancelled,done)")
      .gt("starts_at", new Date().toISOString())
      .order("starts_at", { ascending: true });
    if (eventsError) throw eventsError;

    upcoming = (events ?? []).map((e) => ({
      id: e.id,
      starts_at: e.starts_at,
      subject_label: (e.job_id ? jobNumberById.get(e.job_id) : opportunityNumberById.get(e.opportunity_id!)) ?? "Upcoming visit",
      arrival_window_start: e.arrival_window_start,
      arrival_window_end: e.arrival_window_end,
    }));
  }

  return {
    businessName: business?.name ?? "Customer Center",
    businessWebsite: business?.website ?? null,
    partyName: party?.name ?? "",
    estimates,
    invoices,
    upcoming,
  };
}
