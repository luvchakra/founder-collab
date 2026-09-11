import { createClient } from "../../db/server";
import { listEmployeeOptions } from "../tickets/queries";
import type { ResponsePerformance } from "./types";

const WINDOW_DAYS = 30;
const UNRESOLVED_AGE_BUCKETS = ["0-1 day", "1-3 days", "3-7 days", "7+ days"] as const;

function minutesBetween(startIso: string, endIso: string): number {
  return Math.max(0, (new Date(endIso).getTime() - new Date(startIso).getTime()) / 60000);
}

/** Exported for its own unit test (`response-performance.test.ts`) -- genuinely new
 * pure logic, unlike CRM-14.1's plain aggregation, so worth testing directly rather
 * than only through the RLS harness / a full query integration test. */
export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const lower = sorted[mid - 1] ?? sorted[mid]!;
  const upper = sorted[mid]!;
  return sorted.length % 2 === 0 ? Math.round((lower + upper) / 2) : Math.round(upper);
}

export function ageBucket(occurredAt: string): (typeof UNRESOLVED_AGE_BUCKETS)[number] {
  const days = (Date.now() - new Date(occurredAt).getTime()) / (1000 * 60 * 60 * 24);
  if (days <= 1) return "0-1 day";
  if (days <= 3) return "1-3 days";
  if (days <= 7) return "3-7 days";
  return "7+ days";
}

/**
 * CRM-14.3's "Response Performance" -- five metrics, verbatim from the backlog. All
 * computed off `crm.interaction`/`crm.conversation`, the same tables CRM-14.1's SLA
 * card already reads, just broken down further here (by channel, by owner, by age)
 * rather than collapsed to one dashboard number.
 */
export async function getResponsePerformance(businessId: string): Promise<ResponsePerformance> {
  const supabase = await createClient();
  const now = new Date().toISOString();
  const windowStart = new Date(Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const [respondedRes, unresolvedRes, employees] = await Promise.all([
    supabase
      .from("interaction")
      .select("channel, conversation_id, occurred_at, responded_at, response_due_at, status")
      .eq("business_id", businessId)
      .eq("direction", "inbound")
      .eq("status", "responded")
      .not("responded_at", "is", null)
      .gte("occurred_at", windowStart),
    supabase
      .from("interaction")
      .select("occurred_at")
      .eq("business_id", businessId)
      .eq("direction", "inbound")
      .eq("requires_response", true),
    listEmployeeOptions(businessId),
  ]);
  if (respondedRes.error) throw respondedRes.error;
  if (unresolvedRes.error) throw unresolvedRes.error;

  const responded = respondedRes.data ?? [];
  const employeeNameById = new Map(employees.map((e) => [e.id, e.full_name ?? e.email ?? "Unnamed"]));

  // Median first response time, over every responded inbound message in the window.
  const responseTimes = responded.map((i) => minutesBetween(i.occurred_at, i.responded_at!));
  const medianFirstResponseMinutes = median(responseTimes);

  // SLA compliance -- same "deadline already passed" gating CRM-14.1's own dashboard
  // card uses, recomputed here rather than imported since this query already fetches a
  // different (wider) column set for its other four metrics.
  const slaEligible = responded.filter((i) => i.response_due_at);
  const slaCompliant = slaEligible.filter((i) => i.responded_at! <= i.response_due_at!);
  const slaCompliancePercent = slaEligible.length > 0 ? Math.round((slaCompliant.length / slaEligible.length) * 100) : null;

  // Unresolved interactions by age -- every inbound message still needing a response,
  // right now, bucketed by how long it's been waiting.
  const bucketCounts = new Map<string, number>(UNRESOLVED_AGE_BUCKETS.map((b) => [b, 0]));
  for (const row of unresolvedRes.data ?? []) {
    const bucket = ageBucket(row.occurred_at);
    bucketCounts.set(bucket, (bucketCounts.get(bucket) ?? 0) + 1);
  }
  const unresolvedByAge = UNRESOLVED_AGE_BUCKETS.map((bucket) => ({ bucket, count: bucketCounts.get(bucket) ?? 0 }));

  // Channel response time.
  const byChannel = new Map<string, number[]>();
  for (const i of responded) {
    const list = byChannel.get(i.channel) ?? [];
    list.push(minutesBetween(i.occurred_at, i.responded_at!));
    byChannel.set(i.channel, list);
  }
  const channelResponseTime = [...byChannel.entries()]
    .map(([channel, times]) => ({ channel, medianResponseMinutes: median(times) }))
    .sort((a, b) => a.channel.localeCompare(b.channel));

  // Owner/team performance -- attributed via the conversation each responded
  // interaction belongs to (`conversation.assigned_to`, CRM-06.3's own ownership field);
  // individual interactions have no sender of their own to attribute to.
  const conversationIds = [...new Set(responded.map((i) => i.conversation_id))];
  const ownerByConversationId = new Map<string, string | null>();
  if (conversationIds.length > 0) {
    const { data: conversations, error: conversationsError } = await supabase
      .from("conversation")
      .select("id, assigned_to")
      .eq("business_id", businessId)
      .in("id", conversationIds);
    if (conversationsError) throw conversationsError;
    for (const c of conversations ?? []) ownerByConversationId.set(c.id, c.assigned_to);
  }
  const byOwner = new Map<string | null, number[]>();
  for (const i of responded) {
    const ownerId = ownerByConversationId.get(i.conversation_id) ?? null;
    const list = byOwner.get(ownerId) ?? [];
    list.push(minutesBetween(i.occurred_at, i.responded_at!));
    byOwner.set(ownerId, list);
  }
  const ownerPerformance = [...byOwner.entries()]
    .map(([ownerId, times]) => ({
      ownerId,
      ownerName: ownerId ? (employeeNameById.get(ownerId) ?? "Unknown") : "Unassigned",
      responded: times.length,
      medianResponseMinutes: median(times),
    }))
    .sort((a, b) => b.responded - a.responded);

  return {
    medianFirstResponseMinutes,
    slaCompliancePercent,
    unresolvedByAge,
    ownerPerformance,
    channelResponseTime,
  };
}
