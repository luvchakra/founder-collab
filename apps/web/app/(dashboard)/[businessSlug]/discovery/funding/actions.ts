"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { businessPath } from "@/lib/business-path";
import {
  addInvestorContact,
  addInvestorToRound,
  addResearch,
  addStandardDataRoomItems,
  addStandardReadinessItems,
  createDataRoomPlaceholder,
  createDiligenceItem,
  createInvestor,
  createOutreachDraft,
  createReadinessItem,
  createRound,
  deleteDataRoomItem,
  deleteReadinessItem,
  deleteResearch,
  logInteraction,
  moveInvestorStage,
  revokeShare,
  saveDiligenceResponse,
  saveFundingProfile,
  sendApprovedOutreach,
  setDataRoomItemStatus,
  setInvestorStatus,
  setReadinessStatus,
  shareDataRoomItem,
  transitionDiligence,
  transitionOutreach,
  transitionRound,
  updateInvestor,
  updateOutreachDraft,
  updatePipelinePlan,
  updateReadinessItem,
  updateRound,
  uploadDataRoomFile,
} from "@cofounderai/module-discovery/lib/funding/mutations";
import {
  contactInputSchema,
  dataRoomItemInputSchema,
  diligenceInputSchema,
  diligenceResponseSchema,
  diligenceStatusSchema,
  firstIssue,
  interactionInputSchema,
  investorInputSchema,
  outreachInputSchema,
  profileInputSchema,
  readinessInputSchema,
  readinessStatusSchema,
  researchInputSchema,
  roundInputSchema,
  shareInputSchema,
} from "@cofounderai/module-discovery/lib/funding/schemas";
import { OUTREACH_STATUSES, PIPELINE_STAGES, ROUND_STATUSES, type OutreachStatus, type PipelineStage, type RoundStatus } from "@cofounderai/module-discovery/lib/funding/types";
import type { FormState } from "@cofounderai/module-discovery/components/marketing/action-form";

/**
 * FND-03..13 — the Funding screens' server actions. Parsing only: the licence check,
 * permission check, tenant-scoped write and audit entry all live in
 * lib/funding/mutations.ts. Recipients, amounts and ids from the browser are parsed and
 * re-checked there; nothing here trusts them.
 */

async function base(businessId: string): Promise<string> {
  return `${await businessPath(businessId)}/discovery/funding`;
}

async function refresh(businessId: string): Promise<void> {
  revalidatePath(await base(businessId), "layout");
}

function fields(formData: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of formData.entries()) if (typeof value === "string" && !key.startsWith("$")) out[key] = value;
  return out;
}

function failure(error: unknown, fallback: string): FormState {
  const message = error instanceof Error ? error.message : "";
  return { error: message || fallback };
}

// Profile ---------------------------------------------------------------------

export async function saveProfileAction(businessId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const metrics = formData.getAll("traction_metric").map(String);
  const values = formData.getAll("traction_value").map(String);
  const periods = formData.getAll("traction_period").map(String);
  const sources = formData.getAll("traction_source").map(String);
  const provenances = formData.getAll("traction_provenance").map(String);
  const traction = metrics
    .map((metric, i) => ({ metric, value: values[i] ?? "", period: periods[i] ?? "", source: sources[i] ?? "", provenance: provenances[i] || undefined }))
    .filter((t) => t.metric.trim() || t.value.trim() || t.source.trim());
  const parsed = profileInputSchema.safeParse({ ...fields(formData), traction });
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  try {
    await saveFundingProfile(businessId, parsed.data);
  } catch (error) {
    return failure(error, "Could not save the profile.");
  }
  await refresh(businessId);
  return { success: true, message: "Profile saved." };
}

// Rounds ----------------------------------------------------------------------

export async function createRoundAction(businessId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = roundInputSchema.safeParse({ ...fields(formData), isPrimary: formData.get("isPrimary") === "on" });
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  let id: string;
  try {
    id = await createRound(businessId, parsed.data);
  } catch (error) {
    return failure(error, "Could not create the round.");
  }
  await refresh(businessId);
  redirect(`${await base(businessId)}/rounds/${id}`);
}

export async function updateRoundAction(businessId: string, roundId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = roundInputSchema.safeParse({ ...fields(formData), isPrimary: formData.get("isPrimary") === "on" });
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  try {
    await updateRound(businessId, roundId, parsed.data);
  } catch (error) {
    return failure(error, "Could not save the round.");
  }
  await refresh(businessId);
  return { success: true, message: "Saved." };
}

export async function transitionRoundAction(businessId: string, roundId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const to = String(formData.get("to") ?? "");
  if (!(ROUND_STATUSES as readonly string[]).includes(to)) return { error: "Unknown status." };
  try {
    await transitionRound(businessId, roundId, to as RoundStatus);
  } catch (error) {
    return failure(error, "Could not change the round's status.");
  }
  await refresh(businessId);
  return { success: true };
}

// Investors -------------------------------------------------------------------

export async function createInvestorAction(businessId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = investorInputSchema.safeParse(fields(formData));
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  let id: string;
  try {
    id = await createInvestor(businessId, parsed.data);
  } catch (error) {
    return failure(error, "Could not add the investor.");
  }
  await refresh(businessId);
  redirect(`${await base(businessId)}/investors/${id}`);
}

export async function updateInvestorAction(businessId: string, investorId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = investorInputSchema.safeParse(fields(formData));
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  try {
    await updateInvestor(businessId, investorId, parsed.data);
  } catch (error) {
    return failure(error, "Could not save the investor.");
  }
  await refresh(businessId);
  return { success: true, message: "Saved." };
}

export async function setInvestorStatusAction(businessId: string, investorId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const status = formData.get("to") === "archived" ? "archived" : "active";
  try {
    await setInvestorStatus(businessId, investorId, status);
  } catch (error) {
    return failure(error, "Could not update the investor.");
  }
  await refresh(businessId);
  return { success: true };
}

export async function addContactAction(businessId: string, investorId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = contactInputSchema.safeParse(fields(formData));
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  try {
    await addInvestorContact(businessId, investorId, parsed.data);
  } catch (error) {
    return failure(error, "Could not add the contact.");
  }
  await refresh(businessId);
  return { success: true, message: "Contact added." };
}

export async function addResearchAction(businessId: string, investorId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = researchInputSchema.safeParse(fields(formData));
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  try {
    await addResearch(businessId, investorId, parsed.data);
  } catch (error) {
    return failure(error, "Could not save the finding.");
  }
  await refresh(businessId);
  return { success: true, message: "Finding saved." };
}

export async function deleteResearchAction(businessId: string, researchId: string): Promise<FormState> {
  try {
    await deleteResearch(businessId, researchId);
  } catch (error) {
    return failure(error, "Could not remove the finding.");
  }
  await refresh(businessId);
  return { success: true };
}

// Pipeline --------------------------------------------------------------------

export async function addToRoundAction(businessId: string, investorId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const roundId = String(formData.get("roundId") ?? "");
  const stage = String(formData.get("stage") ?? "identified");
  if (!roundId) return { error: "Choose a round." };
  if (!(PIPELINE_STAGES as readonly string[]).includes(stage) || stage === "committed" || stage === "invested" || stage === "passed") {
    return { error: "Start the investor at an early stage; commitments are recorded by moving them." };
  }
  try {
    await addInvestorToRound(businessId, investorId, roundId, stage as PipelineStage);
  } catch (error) {
    return failure(error, "Could not add the investor to the round.");
  }
  await refresh(businessId);
  return { success: true, message: "Added to the round." };
}

function optionalAmount(raw: FormDataEntryValue | null): number | null | undefined | "invalid" {
  if (raw === null) return undefined;
  const text = String(raw).replace(/,/g, "").trim();
  if (!text) return undefined;
  const n = Number(text);
  if (!Number.isFinite(n) || n < 0) return "invalid";
  return Math.round(n * 100) / 100;
}

export async function moveStageAction(businessId: string, pipelineId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const to = String(formData.get("to") ?? "");
  if (!(PIPELINE_STAGES as readonly string[]).includes(to)) return { error: "Unknown stage." };
  const committed = optionalAmount(formData.get("committedAmount"));
  const invested = optionalAmount(formData.get("investedAmount"));
  if (committed === "invalid" || invested === "invalid") return { error: "Amounts must be numbers, zero or more." };
  const currencyRaw = String(formData.get("currency") ?? "").trim().toUpperCase();
  if (currencyRaw && !/^[A-Z]{3}$/.test(currencyRaw)) return { error: "Use a three-letter currency code such as INR." };
  const passReason = String(formData.get("passReason") ?? "").trim();
  try {
    await moveInvestorStage(businessId, pipelineId, to as PipelineStage, {
      ...(committed !== undefined ? { committedAmount: committed } : {}),
      ...(invested !== undefined ? { investedAmount: invested } : {}),
      ...(currencyRaw ? { currency: currencyRaw } : {}),
      ...(to === "passed" ? { passReason: passReason || null } : {}),
    });
  } catch (error) {
    return failure(error, "Could not move the investor.");
  }
  await refresh(businessId);
  return { success: true };
}

export async function updatePlanAction(businessId: string, pipelineId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const f = fields(formData);
  const due = (f.nextActionDue ?? "").trim();
  if (due && Number.isNaN(new Date(due).getTime())) return { error: "Enter a valid date." };
  try {
    await updatePipelinePlan(businessId, pipelineId, {
      nextAction: f.nextAction?.trim() || null,
      nextActionDue: due || null,
      fitSummary: f.fitSummary?.trim() || null,
      notes: f.notes?.trim() || null,
    });
  } catch (error) {
    return failure(error, "Could not save.");
  }
  await refresh(businessId);
  return { success: true, message: "Saved." };
}

export async function logInteractionAction(businessId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = interactionInputSchema.safeParse(fields(formData));
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  try {
    await logInteraction(businessId, parsed.data);
  } catch (error) {
    return failure(error, "Could not log the interaction.");
  }
  await refresh(businessId);
  return { success: true, message: "Logged." };
}

// Outreach --------------------------------------------------------------------

export async function createOutreachAction(businessId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = outreachInputSchema.safeParse(fields(formData));
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  let id: string;
  try {
    id = await createOutreachDraft(businessId, parsed.data);
  } catch (error) {
    return failure(error, "Could not save the draft.");
  }
  await refresh(businessId);
  redirect(`${await base(businessId)}/outreach/${id}`);
}

export async function updateOutreachAction(businessId: string, outreachId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = outreachInputSchema.safeParse(fields(formData));
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  try {
    await updateOutreachDraft(businessId, outreachId, parsed.data);
  } catch (error) {
    return failure(error, "Could not save the draft.");
  }
  await refresh(businessId);
  return { success: true, message: "Saved. Approval is needed again before sending." };
}

export async function transitionOutreachAction(businessId: string, outreachId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const to = String(formData.get("to") ?? "");
  if (!(OUTREACH_STATUSES as readonly string[]).includes(to)) return { error: "Unknown status." };
  try {
    await transitionOutreach(businessId, outreachId, to as OutreachStatus);
  } catch (error) {
    return failure(error, "Could not change the draft's status.");
  }
  await refresh(businessId);
  return { success: true };
}

export async function sendOutreachAction(businessId: string, outreachId: string): Promise<FormState> {
  let result: Awaited<ReturnType<typeof sendApprovedOutreach>>;
  try {
    result = await sendApprovedOutreach(businessId, outreachId);
  } catch (error) {
    return failure(error, "Could not send.");
  }
  await refresh(businessId);
  return result.ok ? { success: true, message: "Sent. The provider confirmed delivery to its servers." } : { error: `Not sent: ${result.reason}` };
}

// Readiness -------------------------------------------------------------------

export async function createReadinessAction(businessId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = readinessInputSchema.safeParse(fields(formData));
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  try {
    await createReadinessItem(businessId, parsed.data);
  } catch (error) {
    return failure(error, "Could not add the item.");
  }
  await refresh(businessId);
  return { success: true, message: "Added." };
}

export async function updateReadinessAction(businessId: string, itemId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = readinessInputSchema.safeParse(fields(formData));
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  try {
    await updateReadinessItem(businessId, itemId, parsed.data);
  } catch (error) {
    return failure(error, "Could not save the item.");
  }
  await refresh(businessId);
  return { success: true, message: "Saved." };
}

export async function setReadinessStatusAction(businessId: string, itemId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = readinessStatusSchema.safeParse(formData.get("to"));
  if (!parsed.success) return { error: "Unknown status." };
  try {
    await setReadinessStatus(businessId, itemId, parsed.data);
  } catch (error) {
    return failure(error, "Could not update the item.");
  }
  await refresh(businessId);
  return { success: true };
}

export async function deleteReadinessAction(businessId: string, itemId: string): Promise<FormState> {
  try {
    await deleteReadinessItem(businessId, itemId);
  } catch (error) {
    return failure(error, "Could not remove the item.");
  }
  await refresh(businessId);
  return { success: true };
}

export async function addStandardReadinessAction(businessId: string): Promise<FormState> {
  let n: number;
  try {
    n = await addStandardReadinessItems(businessId);
  } catch (error) {
    return failure(error, "Could not add the checklist.");
  }
  await refresh(businessId);
  return { success: true, message: n === 0 ? "You already have every standard item." : `Added ${n} items, all marked Missing until you review them.` };
}

// Data room -------------------------------------------------------------------

export async function uploadDataRoomAction(businessId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a file to upload." };
  const itemId = String(formData.get("itemId") ?? "").trim();
  try {
    if (itemId) {
      await uploadDataRoomFile(businessId, file, { itemId });
    } else {
      const parsed = dataRoomItemInputSchema.safeParse({ ...fields(formData), name: String(formData.get("name") || file.name) });
      if (!parsed.success) return { error: firstIssue(parsed.error) };
      await uploadDataRoomFile(businessId, file, { item: parsed.data });
    }
  } catch (error) {
    return failure(error, "Could not upload the file.");
  }
  await refresh(businessId);
  return { success: true, message: "Uploaded as a draft. Mark it Ready when it can be shared." };
}

export async function createPlaceholderAction(businessId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = dataRoomItemInputSchema.safeParse(fields(formData));
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  try {
    await createDataRoomPlaceholder(businessId, parsed.data);
  } catch (error) {
    return failure(error, "Could not add the document.");
  }
  await refresh(businessId);
  return { success: true, message: "Added to the checklist." };
}

export async function addStandardDataRoomAction(businessId: string): Promise<FormState> {
  let n: number;
  try {
    n = await addStandardDataRoomItems(businessId);
  } catch (error) {
    return failure(error, "Could not add the checklist.");
  }
  await refresh(businessId);
  return { success: true, message: n === 0 ? "You already have every standard document." : `Added ${n} placeholders.` };
}

export async function setDataRoomStatusAction(businessId: string, itemId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const to = String(formData.get("to") ?? "");
  if (to !== "draft" && to !== "ready" && to !== "expired") return { error: "Unknown status." };
  try {
    await setDataRoomItemStatus(businessId, itemId, to);
  } catch (error) {
    return failure(error, "Could not update the document.");
  }
  await refresh(businessId);
  return { success: true };
}

export async function deleteDataRoomAction(businessId: string, itemId: string): Promise<FormState> {
  try {
    await deleteDataRoomItem(businessId, itemId);
  } catch (error) {
    return failure(error, "Could not remove the document.");
  }
  await refresh(businessId);
  return { success: true };
}

/** Creates a share and hands back the one-time link. The link is built from the request's
 * own host, so it points at whichever deployment the founder is using. */
export async function shareDataRoomAction(businessId: string, itemId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = shareInputSchema.safeParse(fields(formData));
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  let token: string;
  try {
    token = await shareDataRoomItem(businessId, itemId, parsed.data);
  } catch (error) {
    return failure(error, "Could not create the link.");
  }
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  const proto = h.get("x-forwarded-proto") ?? "https";
  await refresh(businessId);
  return {
    success: true,
    message: `Link created — copy it now, it is not shown again: ${proto}://${host}/p/dr/${token}`,
  };
}

export async function revokeShareAction(businessId: string, shareId: string): Promise<FormState> {
  try {
    await revokeShare(businessId, shareId);
  } catch (error) {
    return failure(error, "Could not revoke the link.");
  }
  await refresh(businessId);
  return { success: true };
}

// Diligence -------------------------------------------------------------------

export async function createDiligenceAction(businessId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = diligenceInputSchema.safeParse(fields(formData));
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  try {
    await createDiligenceItem(businessId, parsed.data);
  } catch (error) {
    return failure(error, "Could not add the request.");
  }
  await refresh(businessId);
  return { success: true, message: "Added." };
}

export async function saveDiligenceResponseAction(businessId: string, itemId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = diligenceResponseSchema.safeParse({ ...fields(formData), dataRoomItemIds: formData.getAll("dataRoomItemIds").map(String) });
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  try {
    await saveDiligenceResponse(businessId, itemId, parsed.data);
  } catch (error) {
    return failure(error, "Could not save the response.");
  }
  await refresh(businessId);
  return { success: true, message: "Saved." };
}

export async function transitionDiligenceAction(businessId: string, itemId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = diligenceStatusSchema.safeParse(formData.get("to"));
  if (!parsed.success) return { error: "Unknown status." };
  try {
    await transitionDiligence(businessId, itemId, parsed.data);
  } catch (error) {
    return failure(error, "Could not change the request's status.");
  }
  await refresh(businessId);
  return { success: true };
}
