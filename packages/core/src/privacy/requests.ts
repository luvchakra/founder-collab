import { createClient } from "../db/server";
import type { DataSubjectRequest, DsrType } from "./notice";

function coreClient() {
  return createClient({ schema: "core" });
}

/** A signed-in user's request to the platform about their own account data. */
export async function fileOwnRequest(input: {
  userId: string;
  email: string | null;
  type: DsrType;
  details: string;
}): Promise<void> {
  const supabase = await coreClient();
  const { error } = await supabase.from("data_subject_requests").insert({
    requester_user_id: input.userId,
    business_id: null,
    subject_email: input.email,
    request_type: input.type,
    details: input.details || null,
  });
  if (error) throw error;
}

export async function listOwnRequests(userId: string): Promise<DataSubjectRequest[]> {
  const supabase = await coreClient();
  const { data, error } = await supabase
    .from("data_subject_requests")
    .select("*")
    .eq("requester_user_id", userId)
    .is("business_id", null)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}

/** Requests a business received from its own customers/prospects (privacy.manage). */
export async function listBusinessRequests(businessId: string): Promise<DataSubjectRequest[]> {
  const supabase = await coreClient();
  const { data, error } = await supabase
    .from("data_subject_requests")
    .select("*")
    .eq("business_id", businessId)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw error;
  return data;
}

export async function logBusinessRequest(input: {
  businessId: string;
  subjectEmail: string;
  type: DsrType;
  details: string;
}): Promise<string> {
  const supabase = await coreClient();
  const { data, error } = await supabase
    .from("data_subject_requests")
    .insert({
      business_id: input.businessId,
      subject_email: input.subjectEmail,
      request_type: input.type,
      details: input.details || null,
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

export async function setBusinessRequestStatus(
  requestId: string,
  status: "in_progress" | "completed" | "rejected",
  response: string | null,
): Promise<void> {
  const supabase = await coreClient();
  const { error } = await supabase
    .from("data_subject_requests")
    .update({ status, response })
    .eq("id", requestId)
    .not("business_id", "is", null);
  if (error) throw error;
}

/** Erases (or, where tax records require it, restricts) a third-party subject's data in
 * one business, suppresses the address, and triggers every module's own erasure via
 * the privacy.subject_erased domain event. Needs privacy.manage. */
export async function eraseSubjectByEmail(
  businessId: string,
  email: string,
  requestId: string | null,
): Promise<{ contacts_deleted: number; parties_erased: number; parties_restricted: number }> {
  const supabase = await coreClient();
  const { data, error } = await supabase.rpc("erase_subject_by_email", {
    p_business_id: businessId,
    p_email: email,
    p_request_id: requestId,
  });
  if (error) throw error;
  return data;
}
