"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@cofounderai/core/db/server";
import { recordConsent } from "@cofounderai/core/privacy/consent";
import { eraseOwnAccount } from "@cofounderai/core/privacy/account-erasure";
import type { DsrType } from "@cofounderai/core/privacy/notice";
import {
  eraseSubjectByEmail,
  fileOwnRequest,
  logBusinessRequest,
  setBusinessRequestStatus,
} from "@cofounderai/core/privacy/requests";
import { deleteInterestSignup } from "@cofounderai/module-discovery/lib/interest/mutations";

const PRIVACY_PATH = "/dashboard/settings/privacy";
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const OWN_REQUEST_TYPES = new Set<DsrType>(["correction", "restriction", "objection", "grievance", "nomination", "access", "portability", "withdraw_consent", "erasure"]);

export type PrivacyFormState = { error: string } | { success: string } | null;

async function currentUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return user;
}

export async function setMarketingConsentAction(granted: boolean) {
  const user = await currentUser();
  await recordConsent(user.id, "marketing_communications", granted, "settings");
  revalidatePath(PRIVACY_PATH);
}

export async function fileOwnRequestAction(_prev: PrivacyFormState, formData: FormData): Promise<PrivacyFormState> {
  const user = await currentUser();
  const type = String(formData.get("type") ?? "") as DsrType;
  const details = String(formData.get("details") ?? "").trim().slice(0, 4000);
  if (!OWN_REQUEST_TYPES.has(type)) return { error: "Choose a request type." };
  if (!details) return { error: "Tell us what you'd like us to do." };
  await fileOwnRequest({ userId: user.id, email: user.email ?? null, type, details });
  revalidatePath(PRIVACY_PATH);
  return { success: "Request received. We'll respond within 30 days." };
}

/** Irreversible. The user retypes their email to confirm; MFA (when enrolled) has already
 * been enforced on this session by the proxy. */
export async function deleteAccountAction(_prev: PrivacyFormState, formData: FormData): Promise<PrivacyFormState> {
  const user = await currentUser();
  const confirmation = String(formData.get("confirmEmail") ?? "").trim().toLowerCase();
  if (!user.email || confirmation !== user.email.toLowerCase()) {
    return { error: "Type your account email exactly to confirm." };
  }

  const result = await eraseOwnAccount(user.id, user.email);
  if (!result.ok) return { error: result.reason };
  await deleteInterestSignup(user.email);

  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/?account=deleted");
}

// --- A business's register of requests from its own customers/prospects -----------
// Authorization is privacy.manage, enforced by RLS on core.data_subject_requests and
// inside core.erase_subject_by_email() -- these run as the signed-in user.

export async function logBusinessRequestAction(
  businessId: string,
  _prev: PrivacyFormState,
  formData: FormData,
): Promise<PrivacyFormState> {
  await currentUser();
  const email = String(formData.get("email") ?? "").trim();
  const type = String(formData.get("type") ?? "") as DsrType;
  const details = String(formData.get("details") ?? "").trim().slice(0, 4000);
  if (!EMAIL_PATTERN.test(email)) return { error: "Enter the person's email address." };
  if (!OWN_REQUEST_TYPES.has(type)) return { error: "Choose a request type." };
  try {
    await logBusinessRequest({ businessId, subjectEmail: email, type, details });
  } catch {
    return { error: "You don't have permission to manage privacy requests for this business." };
  }
  revalidatePath(PRIVACY_PATH);
  return { success: "Request logged. It's due within 30 days." };
}

export async function eraseSubjectAction(businessId: string, requestId: string) {
  await currentUser();
  const supabase = await createClient({ schema: "core" });
  const { data: request, error } = await supabase
    .from("data_subject_requests")
    .select("subject_email")
    .eq("id", requestId)
    .eq("business_id", businessId)
    .single();
  if (error) throw error;
  if (!request.subject_email) throw new Error("This request no longer holds an email address to erase.");
  await eraseSubjectByEmail(businessId, request.subject_email as string, requestId);
  revalidatePath(PRIVACY_PATH);
}

export async function setRequestStatusAction(requestId: string, status: "in_progress" | "completed" | "rejected") {
  await currentUser();
  await setBusinessRequestStatus(requestId, status, null);
  revalidatePath(PRIVACY_PATH);
}
