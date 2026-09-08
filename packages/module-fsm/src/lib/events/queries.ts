import { cache } from "react";
import { createClient } from "../../db/server";
import { createClient as createCoreClient } from "@cofounderai/core/db/server";
import type { JobOption, OpportunityOption, ScheduleEventItem } from "./types";

function coreClient() {
  return createCoreClient({ schema: "core" });
}

/** The calendar's own read: every event starting in `[startsAtGte, startsAtLt)` (an
 * exclusive upper bound so a day/week boundary never double-counts an event landing
 * exactly on it). Same "no PostgREST embed, join in JS" pattern as jobs/queries.ts and
 * opportunities/queries.ts -- `job_id`/`opportunity_id` have no embed target, and
 * `event_assignees` is a separate table with its own RLS, not a join column. */
export const listEventsForRange = cache(async (businessId: string, startsAtGte: string, startsAtLt: string): Promise<ScheduleEventItem[]> => {
  const supabase = await createClient();
  const { data: events, error } = await supabase
    .from("events")
    .select("*")
    .eq("business_id", businessId)
    .gte("starts_at", startsAtGte)
    .lt("starts_at", startsAtLt)
    .order("starts_at", { ascending: true });
  if (error) throw error;
  if (events.length === 0) return [];

  const jobIds = [...new Set(events.map((e) => e.job_id).filter((id): id is string => Boolean(id)))];
  const opportunityIds = [...new Set(events.map((e) => e.opportunity_id).filter((id): id is string => Boolean(id)))];
  const eventIds = events.map((e) => e.id);

  const [jobsRes, opportunitiesRes, assigneesRes] = await Promise.all([
    jobIds.length ? supabase.from("jobs").select("id, number, party_id, status").in("id", jobIds) : Promise.resolve({ data: [], error: null }),
    opportunityIds.length
      ? supabase.from("opportunities").select("id, number, party_id, status").in("id", opportunityIds)
      : Promise.resolve({ data: [], error: null }),
    supabase.from("event_assignees").select("event_id, employee_id").in("event_id", eventIds),
  ]);
  if (jobsRes.error) throw jobsRes.error;
  if (opportunitiesRes.error) throw opportunitiesRes.error;
  if (assigneesRes.error) throw assigneesRes.error;

  const partyIds = [...new Set([...jobsRes.data.map((j) => j.party_id), ...opportunitiesRes.data.map((o) => o.party_id)])];
  const core = await coreClient();
  const { data: parties, error: partiesError } = partyIds.length
    ? await core.from("parties").select("id, name").in("id", partyIds)
    : { data: [], error: null };
  if (partiesError) throw partiesError;
  const partyNameById = new Map(parties.map((p) => [p.id, p.name]));

  const jobById = new Map(jobsRes.data.map((j) => [j.id, j]));
  const opportunityById = new Map(opportunitiesRes.data.map((o) => [o.id, o]));
  const assigneesByEventId = new Map<string, string[]>();
  for (const a of assigneesRes.data) {
    const list = assigneesByEventId.get(a.event_id) ?? [];
    list.push(a.employee_id);
    assigneesByEventId.set(a.event_id, list);
  }

  return events.map((e) => {
    const job = e.job_id ? jobById.get(e.job_id) : undefined;
    const opportunity = e.opportunity_id ? opportunityById.get(e.opportunity_id) : undefined;
    const partyId = job?.party_id ?? opportunity?.party_id;
    return {
      ...e,
      assignee_employee_ids: assigneesByEventId.get(e.id) ?? [],
      subject_label: job?.number ?? opportunity?.number ?? "-",
      party_name: partyId ? partyNameById.get(partyId) ?? "Unknown customer" : "Unknown customer",
    };
  });
});

/** Jobs a work/reminder event can be attached to -- excludes cancelled jobs (PRD §4's
 * state machine has no transition out of `cancelled`, so scheduling more work against
 * one would be a dead end the UI shouldn't offer). */
export const listJobOptionsForScheduling = cache(async (businessId: string): Promise<JobOption[]> => {
  const supabase = await createClient();
  const { data: jobs, error } = await supabase
    .from("jobs")
    .select("id, number, party_id, status")
    .eq("business_id", businessId)
    .neq("status", "cancelled")
    .order("created_at", { ascending: false });
  if (error) throw error;
  if (jobs.length === 0) return [];

  const core = await coreClient();
  const partyIds = [...new Set(jobs.map((j) => j.party_id))];
  const { data: parties, error: partiesError } = await core.from("parties").select("id, name").in("id", partyIds);
  if (partiesError) throw partiesError;
  const partyNameById = new Map(parties.map((p) => [p.id, p.name]));

  return jobs.map((j) => ({ id: j.id, number: j.number, status: j.status, party_name: partyNameById.get(j.party_id) ?? "Unknown customer" }));
});

/** Opportunities an estimate/reminder event can be attached to -- excludes `lost` (dead)
 * and `won` (already converted to a job; schedule against the job instead). */
export const listOpportunityOptionsForScheduling = cache(async (businessId: string): Promise<OpportunityOption[]> => {
  const supabase = await createClient();
  const { data: opportunities, error } = await supabase
    .from("opportunities")
    .select("id, number, party_id, status")
    .eq("business_id", businessId)
    .not("status", "in", "(lost,won)")
    .order("created_at", { ascending: false });
  if (error) throw error;
  if (opportunities.length === 0) return [];

  const core = await coreClient();
  const partyIds = [...new Set(opportunities.map((o) => o.party_id))];
  const { data: parties, error: partiesError } = await core.from("parties").select("id, name").in("id", partyIds);
  if (partiesError) throw partiesError;
  const partyNameById = new Map(parties.map((p) => [p.id, p.name]));

  return opportunities.map((o) => ({
    id: o.id,
    number: o.number,
    status: o.status,
    party_name: partyNameById.get(o.party_id) ?? "Unknown customer",
  }));
});
