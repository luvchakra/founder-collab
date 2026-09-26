import { createClient } from "../../db/server";
import { createClient as createCoreClient } from "@cofounderai/core/db/server";
import { requireModule } from "@cofounderai/core/licensing/queries";
import { requirePermission } from "@cofounderai/core/rbac/require-permission";
import { writeAuditLog } from "@cofounderai/core/audit/mutations";
import { deleteAttachment, uploadAttachment } from "@cofounderai/core/attachments/mutations";
import { getBusiness, requireUser } from "../tenancy/queries";
import { STANDARD_DATA_ROOM_ITEMS, STANDARD_READINESS_ITEMS } from "./checklist";
import { newShareToken, validateDataRoomFile } from "./files";
import { canSend, checkDiligenceMove, checkOutreachMove, checkRoundMove, checkStageMove } from "./lifecycle";
import { deliverInvestorEmail } from "./outreach-send";
import type {
  ContactInput,
  DataRoomItemInput,
  DiligenceInput,
  DiligenceResponseInput,
  InteractionInput,
  InvestorInput,
  OutreachInput,
  ProfileInput,
  ReadinessInput,
  ResearchInput,
  RoundInput,
  ShareInput,
} from "./schemas";
import type { DiligenceStatus, OutreachStatus, PipelineStage, ReadinessStatus, RoundStatus } from "./types";

/**
 * FND-01 — the Funding write layer. Same three checks as Marketing, in the same order:
 * Discovery licence (`requireModule`), then the RBAC permission for the operation, then
 * the RLS-bound write whose `tenant AND licensed` policy is authoritative. Sensitive
 * outward actions — approving or sending investor outreach, sharing a data-room document,
 * accepting or closing diligence — need `funding.approve`; nothing here performs them on
 * its own schedule (§27.4, §29.5, §30.3).
 */

export class FundingError extends Error {
  constructor(
    public readonly code:
      | "NOT_FOUND"
      | "INVALID_STATE"
      | "CONFLICT"
      | "FILE_INVALID"
      | "NO_RECIPIENT"
      | "SEND_FAILED",
    message: string,
  ) {
    super(message);
    this.name = "FundingError";
  }
}

type Perm = "funding.manage" | "funding.approve";

async function authorise(businessId: string, permission: Perm): Promise<void> {
  await requireModule(businessId, "discovery");
  await requirePermission(businessId, permission);
}

function notFound(what: string): FundingError {
  return new FundingError("NOT_FOUND", `That ${what} no longer exists.`);
}

async function audit(
  businessId: string,
  action: string,
  entityType: string,
  entityId: string,
  before: Record<string, unknown> | null = null,
  after: Record<string, unknown> | null = null,
) {
  await writeAuditLog({ businessId, action: `funding.${action}`, entityType, entityId, before, after });
}

// ---------------------------------------------------------------------------
// Profile (§21)
// ---------------------------------------------------------------------------

export async function saveFundingProfile(businessId: string, input: ProfileInput): Promise<void> {
  await authorise(businessId, "funding.manage");
  const supabase = await createClient();
  const row = {
    business_id: businessId,
    company: { geography: input.companyGeography, founded: input.companyFounded, team: input.companyTeam, summary: input.companySummary },
    product: { problem: input.productProblem, differentiation: input.productDifferentiation, evidence: input.productEvidence },
    market: {
      targetMarket: input.marketTarget,
      geography: input.marketGeography,
      segmentation: input.marketSegmentation,
      evidence: input.marketEvidence,
    },
    traction: input.traction,
    business_model: {
      pricing: input.modelPricing,
      revenueModel: input.modelRevenue,
      contractModel: input.modelContract,
      recurring: input.modelRecurring,
    },
    objective: {
      targetAmount: input.objectiveAmount,
      currency: input.objectiveCurrency,
      instrument: input.objectiveInstrument,
      useOfFunds: input.objectiveUseOfFunds,
      targetClose: input.objectiveTargetClose,
    },
    updated_by: (await requireUser()).id,
  };
  const { data, error } = await supabase.from("funding_profiles").upsert(row, { onConflict: "business_id" }).select("id").single();
  if (error) throw error;
  await audit(businessId, "profile.saved", "funding_profile", data.id as string);
}

// ---------------------------------------------------------------------------
// Rounds (§23)
// ---------------------------------------------------------------------------

function roundRow(input: RoundInput) {
  return {
    name: input.name,
    round_type: input.roundType,
    is_primary: input.isPrimary,
    target_amount: input.targetAmount,
    minimum_amount: input.minimumAmount,
    maximum_amount: input.maximumAmount,
    currency: input.currency,
    instrument: input.instrument,
    pre_money_valuation: input.preMoneyValuation,
    post_money_valuation: input.postMoneyValuation,
    target_close_date: input.targetCloseDate,
    use_of_funds: input.useOfFunds,
    notes: input.notes,
  };
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: string }).code === "23505";
}

export async function createRound(businessId: string, input: RoundInput): Promise<string> {
  await authorise(businessId, "funding.manage");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("funding_rounds")
    .insert({ business_id: businessId, ...roundRow(input), status: "planning" })
    .select("id")
    .single();
  if (error) {
    if (isUniqueViolation(error)) {
      throw new FundingError("CONFLICT", "There is already a live primary round. Close it, or save this one as a parallel round.");
    }
    throw error;
  }
  await audit(businessId, "round.created", "funding_round", data.id as string, null, { name: input.name, type: input.roundType });
  return data.id as string;
}

export async function updateRound(businessId: string, roundId: string, input: RoundInput): Promise<void> {
  await authorise(businessId, "funding.manage");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("funding_rounds")
    .update({ ...roundRow(input), updated_by: (await requireUser()).id })
    .eq("business_id", businessId)
    .eq("id", roundId)
    .select("id");
  if (error) {
    if (isUniqueViolation(error)) throw new FundingError("CONFLICT", "There is already a live primary round.");
    throw error;
  }
  if (!data || data.length === 0) throw notFound("round");
  await audit(businessId, "round.updated", "funding_round", roundId);
}

export async function transitionRound(businessId: string, roundId: string, to: RoundStatus): Promise<void> {
  await authorise(businessId, "funding.manage");
  const supabase = await createClient();
  const { data: round, error: readError } = await supabase
    .from("funding_rounds")
    .select("status, target_amount, currency, opened_at")
    .eq("business_id", businessId)
    .eq("id", roundId)
    .maybeSingle();
  if (readError) throw readError;
  if (!round) throw notFound("round");
  const from = round.status as RoundStatus;
  const check = checkRoundMove(from, to, {
    targetAmount: round.target_amount === null ? null : Number(round.target_amount),
    currency: (round.currency as string) ?? null,
  });
  if (!check.ok) throw new FundingError("INVALID_STATE", check.reason);

  const patch: Record<string, unknown> = { status: to, updated_by: (await requireUser()).id };
  if (to === "open" && !round.opened_at) patch.opened_at = new Date().toISOString();
  if (to === "closed") patch.actual_close_date = new Date().toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from("funding_rounds")
    .update(patch)
    .eq("business_id", businessId)
    .eq("id", roundId)
    .eq("status", from)
    .select("id");
  if (error) {
    if (isUniqueViolation(error)) throw new FundingError("CONFLICT", "Another primary round is already live.");
    throw error;
  }
  if (!data || data.length === 0) throw new FundingError("CONFLICT", "Someone else changed this round. Refresh and try again.");
  await audit(businessId, `round.${to}`, "funding_round", roundId, { status: from }, { status: to });
}

// ---------------------------------------------------------------------------
// Investors (§24) — the firm is a core.parties row with the 'investor' role
// ---------------------------------------------------------------------------

function investorRow(input: InvestorInput) {
  return {
    investor_type: input.investorType,
    website: input.website,
    geographies: input.geographies,
    stages: input.stages,
    sectors: input.sectors,
    check_min: input.checkMin,
    check_max: input.checkMax,
    currency: input.currency,
    source: input.source,
    source_note: input.sourceNote,
    notes: input.notes,
  };
}

export async function createInvestor(businessId: string, input: InvestorInput): Promise<string> {
  await authorise(businessId, "funding.manage");
  const core = await createCoreClient({ schema: "core" });
  const { data: party, error: partyError } = await core
    .from("parties")
    .insert({ business_id: businessId, kind: input.investorType === "angel" ? "person" : "company", name: input.name, email: input.email })
    .select("id")
    .single();
  if (partyError) throw partyError;
  const partyId = party.id as string;

  const cleanup = async () => {
    await core.from("parties").delete().eq("business_id", businessId).eq("id", partyId);
  };

  const { error: roleError } = await core.from("party_roles").insert({ business_id: businessId, party_id: partyId, role: "investor" });
  if (roleError) {
    await cleanup();
    throw roleError;
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("investors")
    .insert({ business_id: businessId, party_id: partyId, ...investorRow(input) })
    .select("id")
    .single();
  if (error) {
    await cleanup();
    throw error;
  }
  await audit(businessId, "investor.created", "investor", data.id as string, null, { name: input.name });
  return data.id as string;
}

export async function updateInvestor(businessId: string, investorId: string, input: InvestorInput): Promise<void> {
  await authorise(businessId, "funding.manage");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("investors")
    .update({ ...investorRow(input), updated_by: (await requireUser()).id })
    .eq("business_id", businessId)
    .eq("id", investorId)
    .select("party_id");
  if (error) throw error;
  if (!data || data.length === 0) throw notFound("investor");
  const core = await createCoreClient({ schema: "core" });
  const { error: partyError } = await core
    .from("parties")
    .update({ name: input.name, email: input.email })
    .eq("business_id", businessId)
    .eq("id", data[0]!.party_id as string);
  if (partyError) throw partyError;
  await audit(businessId, "investor.updated", "investor", investorId);
}

export async function setInvestorStatus(businessId: string, investorId: string, status: "active" | "archived"): Promise<void> {
  await authorise(businessId, "funding.manage");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("investors")
    .update({ status, updated_by: (await requireUser()).id })
    .eq("business_id", businessId)
    .eq("id", investorId)
    .select("id");
  if (error) throw error;
  if (!data || data.length === 0) throw notFound("investor");
  await audit(businessId, `investor.${status}`, "investor", investorId);
}

async function investorPartyId(businessId: string, investorId: string): Promise<string> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("investors").select("party_id").eq("business_id", businessId).eq("id", investorId).maybeSingle();
  if (error) throw error;
  if (!data) throw notFound("investor");
  return data.party_id as string;
}

/** Investor contacts are core.party_contacts — the platform's one person master (§24.2). */
export async function addInvestorContact(businessId: string, investorId: string, input: ContactInput): Promise<string> {
  await authorise(businessId, "funding.manage");
  const partyId = await investorPartyId(businessId, investorId);
  const core = await createCoreClient({ schema: "core" });
  const { count } = await core
    .from("party_contacts")
    .select("id", { count: "exact", head: true })
    .eq("business_id", businessId)
    .eq("party_id", partyId);
  const { data, error } = await core
    .from("party_contacts")
    .insert({
      business_id: businessId,
      party_id: partyId,
      first_name: input.firstName,
      last_name: input.lastName,
      job_title: input.jobTitle,
      email: input.email,
      linkedin_url: input.linkedinUrl,
      is_primary: (count ?? 0) === 0,
    })
    .select("id")
    .single();
  if (error) throw error;
  await audit(businessId, "investor.contact_added", "investor", investorId, null, { contactId: data.id });
  return data.id as string;
}

export async function addResearch(businessId: string, investorId: string, input: ResearchInput): Promise<void> {
  await authorise(businessId, "funding.manage");
  const supabase = await createClient();
  const { error } = await supabase.from("investor_research").insert({
    business_id: businessId,
    investor_id: investorId,
    field: input.field,
    content: input.content,
    provenance: input.provenance,
    source_url: input.sourceUrl,
    source_title: input.sourceTitle,
  });
  if (error) throw error;
  const { error: updateError } = await supabase
    .from("investors")
    .update({ research_status: "researched", last_researched_at: new Date().toISOString() })
    .eq("business_id", businessId)
    .eq("id", investorId);
  if (updateError) throw updateError;
}

export async function deleteResearch(businessId: string, researchId: string): Promise<void> {
  await authorise(businessId, "funding.manage");
  const supabase = await createClient();
  const { error } = await supabase.from("investor_research").delete().eq("business_id", businessId).eq("id", researchId);
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Pipeline (§25) — stage changes go through the atomic database function
// ---------------------------------------------------------------------------

export async function addInvestorToRound(
  businessId: string,
  investorId: string,
  roundId: string,
  stage: PipelineStage = "identified",
): Promise<string> {
  await authorise(businessId, "funding.manage");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("start_investor_pipeline", {
    p_business_id: businessId,
    p_investor_id: investorId,
    p_round_id: roundId,
    p_stage: stage,
  });
  if (error) {
    if (isUniqueViolation(error)) throw new FundingError("CONFLICT", "This investor is already in that round's pipeline.");
    throw error;
  }
  await audit(businessId, "pipeline.added", "investor_pipeline", data as string, null, { investorId, roundId, stage });
  return data as string;
}

export async function moveInvestorStage(
  businessId: string,
  pipelineId: string,
  to: PipelineStage,
  extras: { committedAmount?: number | null; investedAmount?: number | null; currency?: string | null; passReason?: string | null; note?: string | null } = {},
): Promise<void> {
  await authorise(businessId, "funding.manage");
  const supabase = await createClient();
  const { data: record, error: readError } = await supabase
    .from("investor_pipeline")
    .select("stage, committed_amount, invested_amount, currency")
    .eq("business_id", businessId)
    .eq("id", pipelineId)
    .maybeSingle();
  if (readError) throw readError;
  if (!record) throw notFound("pipeline record");

  const from = record.stage as PipelineStage;
  const amounts = {
    committedAmount: extras.committedAmount ?? (record.committed_amount === null ? null : Number(record.committed_amount)),
    investedAmount: extras.investedAmount ?? (record.invested_amount === null ? null : Number(record.invested_amount)),
    currency: extras.currency ?? ((record.currency as string) ?? null),
  };
  const check = checkStageMove(from, to, amounts);
  if (!check.ok) throw new FundingError("INVALID_STATE", check.reason);

  // Amounts and the pass reason are recorded first, guarded on the stage just read, so a
  // concurrent move is caught here as well as in the stage function.
  const patch: Record<string, unknown> = {};
  if (extras.committedAmount !== undefined) patch.committed_amount = extras.committedAmount;
  if (extras.investedAmount !== undefined) patch.invested_amount = extras.investedAmount;
  if (extras.currency !== undefined) patch.currency = extras.currency;
  if (to === "passed" && extras.passReason !== undefined) patch.pass_reason = extras.passReason;
  if (Object.keys(patch).length > 0) {
    const { data, error } = await supabase
      .from("investor_pipeline")
      .update(patch)
      .eq("business_id", businessId)
      .eq("id", pipelineId)
      .eq("stage", from)
      .select("id");
    if (error) throw error;
    if (!data || data.length === 0) throw new FundingError("CONFLICT", "Someone else moved this investor. Refresh and try again.");
  }

  const { error } = await supabase.rpc("move_investor_stage", {
    p_pipeline_id: pipelineId,
    p_from: from,
    p_to: to,
    p_note: extras.note ?? null,
  });
  if (error) {
    if (error.message?.includes("STAGE_CONFLICT")) {
      throw new FundingError("CONFLICT", "Someone else moved this investor. Refresh and try again.");
    }
    throw error;
  }
  await audit(businessId, "pipeline.stage_changed", "investor_pipeline", pipelineId, { stage: from }, { stage: to, ...patch });
}

export async function updatePipelinePlan(
  businessId: string,
  pipelineId: string,
  input: { nextAction: string | null; nextActionDue: string | null; fitSummary: string | null; notes: string | null },
): Promise<void> {
  await authorise(businessId, "funding.manage");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("investor_pipeline")
    .update({
      next_action: input.nextAction,
      next_action_due: input.nextActionDue,
      fit_summary: input.fitSummary,
      notes: input.notes,
      updated_by: (await requireUser()).id,
    })
    .eq("business_id", businessId)
    .eq("id", pipelineId)
    .select("id");
  if (error) throw error;
  if (!data || data.length === 0) throw notFound("pipeline record");
}

// ---------------------------------------------------------------------------
// Interactions (§28)
// ---------------------------------------------------------------------------

export async function logInteraction(businessId: string, input: InteractionInput, source: "manual" | "outreach" = "manual"): Promise<string> {
  await authorise(businessId, "funding.manage");
  const supabase = await createClient();
  const occurredAt = new Date(input.occurredAt).toISOString();
  const { data, error } = await supabase
    .from("investor_interactions")
    .insert({
      business_id: businessId,
      investor_id: input.investorId,
      contact_id: input.contactId,
      round_id: input.roundId,
      interaction_type: input.interactionType,
      occurred_at: occurredAt,
      subject: input.subject,
      notes: input.notes,
      outcome: input.outcome,
      next_action: input.nextAction,
      next_action_due: input.nextActionDue,
      source,
    })
    .select("id")
    .single();
  if (error) throw error;

  // Keep the pipeline's "last interaction" and next action current for that investor.
  let pipelineUpdate = supabase
    .from("investor_pipeline")
    .update({
      last_interaction_at: occurredAt,
      ...(input.nextAction ? { next_action: input.nextAction, next_action_due: input.nextActionDue } : {}),
    })
    .eq("business_id", businessId)
    .eq("investor_id", input.investorId);
  if (input.roundId) pipelineUpdate = pipelineUpdate.eq("round_id", input.roundId);
  const { error: pipelineError } = await pipelineUpdate;
  if (pipelineError) throw pipelineError;
  return data.id as string;
}

// ---------------------------------------------------------------------------
// Outreach (§27) — drafts, explicit approval, provider-confirmed sending
// ---------------------------------------------------------------------------

export async function createOutreachDraft(
  businessId: string,
  input: OutreachInput,
  origin: "user" | "ai_draft" = "user",
  sourceEvidence: unknown[] = [],
): Promise<string> {
  await authorise(businessId, "funding.manage");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("investor_outreach")
    .insert({
      business_id: businessId,
      investor_id: input.investorId,
      contact_id: input.contactId,
      round_id: input.roundId,
      subject: input.subject,
      body: input.body,
      personalization_notes: input.personalizationNotes,
      cta: input.cta,
      origin,
      source_evidence: sourceEvidence,
      status: "draft",
    })
    .select("id")
    .single();
  if (error) throw error;
  await audit(businessId, "outreach.drafted", "investor_outreach", data.id as string, null, { origin });
  return data.id as string;
}

/** Editing an approved draft withdraws the approval: what was approved is not what is there. */
export async function updateOutreachDraft(businessId: string, outreachId: string, input: OutreachInput): Promise<void> {
  await authorise(businessId, "funding.manage");
  const supabase = await createClient();
  const { data: current, error: readError } = await supabase
    .from("investor_outreach")
    .select("status")
    .eq("business_id", businessId)
    .eq("id", outreachId)
    .maybeSingle();
  if (readError) throw readError;
  if (!current) throw notFound("draft");
  const status = current.status as OutreachStatus;
  if (!["draft", "awaiting_approval", "approved", "failed"].includes(status)) {
    throw new FundingError("INVALID_STATE", "Sent outreach is kept as it went out.");
  }
  const { data, error } = await supabase
    .from("investor_outreach")
    .update({
      contact_id: input.contactId,
      round_id: input.roundId,
      subject: input.subject,
      body: input.body,
      personalization_notes: input.personalizationNotes,
      cta: input.cta,
      status: "draft",
      approved_by: null,
      approved_at: null,
      updated_by: (await requireUser()).id,
    })
    .eq("business_id", businessId)
    .eq("id", outreachId)
    .eq("status", status)
    .select("id");
  if (error) throw error;
  if (!data || data.length === 0) throw new FundingError("CONFLICT", "Someone else changed this draft. Refresh and try again.");
  if (status === "approved" || status === "awaiting_approval") {
    await audit(businessId, "outreach.approval_reset", "investor_outreach", outreachId, { status }, { status: "draft" });
  }
}

export async function transitionOutreach(businessId: string, outreachId: string, to: OutreachStatus): Promise<void> {
  await requireModule(businessId, "discovery");
  const supabase = await createClient();
  const { data: current, error: readError } = await supabase
    .from("investor_outreach")
    .select("status")
    .eq("business_id", businessId)
    .eq("id", outreachId)
    .maybeSingle();
  if (readError) throw readError;
  if (!current) throw notFound("draft");
  const from = current.status as OutreachStatus;
  const check = checkOutreachMove(from, to);
  if (!check.ok) throw new FundingError("INVALID_STATE", check.reason);
  await requirePermission(businessId, check.requiresApproval ? "funding.approve" : "funding.manage");

  const user = await requireUser();
  const patch: Record<string, unknown> = { status: to, updated_by: user.id };
  if (to === "approved") {
    patch.approved_by = user.id;
    patch.approved_at = new Date().toISOString();
  }
  if (to === "draft") {
    patch.approved_by = null;
    patch.approved_at = null;
  }
  if (to === "replied") patch.replied_at = new Date().toISOString();
  const { data, error } = await supabase
    .from("investor_outreach")
    .update(patch)
    .eq("business_id", businessId)
    .eq("id", outreachId)
    .eq("status", from)
    .select("id");
  if (error) throw error;
  if (!data || data.length === 0) throw new FundingError("CONFLICT", "Someone else changed this draft. Refresh and try again.");
  await audit(businessId, `outreach.${to}`, "investor_outreach", outreachId, { status: from }, { status: to });
}

/**
 * Sends one approved draft, now, because a person with `funding.approve` pressed Send
 * (§27.4). The outcome recorded is the provider's: `sent` only with its message id,
 * `failed` with its reason. A successful send is logged as an email interaction.
 */
export async function sendApprovedOutreach(businessId: string, outreachId: string): Promise<{ ok: true } | { ok: false; reason: string }> {
  await authorise(businessId, "funding.approve");
  const supabase = await createClient();
  const { data: draft, error: readError } = await supabase
    .from("investor_outreach")
    .select("status, approved_at, investor_id, contact_id, round_id, subject, body")
    .eq("business_id", businessId)
    .eq("id", outreachId)
    .maybeSingle();
  if (readError) throw readError;
  if (!draft) throw notFound("draft");
  const check = canSend(draft.status as OutreachStatus, (draft.approved_at as string) ?? null);
  if (!check.ok) throw new FundingError("INVALID_STATE", check.reason);

  // The recipient is resolved server-side from the business's own records — never taken
  // from the browser.
  const core = await createCoreClient({ schema: "core" });
  let to: string | null = null;
  if (draft.contact_id) {
    const { data: contact } = await core
      .from("party_contacts")
      .select("email")
      .eq("business_id", businessId)
      .eq("id", draft.contact_id as string)
      .maybeSingle();
    to = (contact?.email as string) ?? null;
  }
  if (!to) {
    const partyId = await investorPartyId(businessId, draft.investor_id as string);
    const { data: party } = await core.from("parties").select("email").eq("business_id", businessId).eq("id", partyId).maybeSingle();
    to = (party?.email as string) ?? null;
  }
  if (!to) throw new FundingError("NO_RECIPIENT", "Add an email address for this investor or contact before sending.");

  // Claim the draft before calling the provider. Only one request can move it from
  // approved to sending, so a double click or a retry cannot deliver it twice.
  const user = await requireUser();
  const { data: claimed, error: claimError } = await supabase
    .from("investor_outreach")
    .update({ status: "sending", recipient_email: to, updated_by: user.id })
    .eq("business_id", businessId)
    .eq("id", outreachId)
    .eq("status", "approved")
    .select("id");
  if (claimError) throw claimError;
  if (!claimed || claimed.length === 0) throw new FundingError("CONFLICT", "This draft is already being sent or has changed.");

  const business = await getBusiness(businessId);
  const result = await deliverInvestorEmail({
    to,
    subject: draft.subject as string,
    body: draft.body as string,
    brandName: business?.name ?? "",
    websiteUrl: business?.website ?? null,
  });

  if (!result.ok) {
    await supabase
      .from("investor_outreach")
      .update({ status: "failed", failure_reason: result.reason, provider: result.provider, updated_by: user.id })
      .eq("business_id", businessId)
      .eq("id", outreachId)
      .eq("status", "sending");
    await audit(businessId, "outreach.send_failed", "investor_outreach", outreachId, null, { reason: result.reason });
    return { ok: false, reason: result.reason };
  }

  const sentAt = new Date().toISOString();
  const { error } = await supabase
    .from("investor_outreach")
    .update({
      status: "sent",
      sent_at: sentAt,
      sent_by: user.id,
      recipient_email: to,
      provider: result.provider,
      provider_message_id: result.messageId,
      failure_reason: null,
      updated_by: user.id,
    })
    .eq("business_id", businessId)
    .eq("id", outreachId)
    .eq("status", "sending");
  if (error) throw error;
  await audit(businessId, "outreach.sent", "investor_outreach", outreachId, null, { providerMessageId: result.messageId });
  await logInteraction(
    businessId,
    {
      investorId: draft.investor_id as string,
      contactId: (draft.contact_id as string) ?? null,
      roundId: (draft.round_id as string) ?? null,
      interactionType: "email",
      occurredAt: sentAt,
      subject: draft.subject as string,
      notes: null,
      outcome: null,
      nextAction: null,
      nextActionDue: null,
    },
    "outreach",
  );
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Readiness (§22)
// ---------------------------------------------------------------------------

function readinessEvidence(input: ReadinessInput) {
  return input.evidenceNote || input.evidenceUrl ? [{ note: input.evidenceNote ?? undefined, url: input.evidenceUrl ?? undefined }] : [];
}

export async function createReadinessItem(businessId: string, input: ReadinessInput): Promise<string> {
  await authorise(businessId, "funding.manage");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("funding_readiness_items")
    .insert({
      business_id: businessId,
      category: input.category,
      title: input.title,
      description: input.description,
      missing_information: input.missingInformation,
      recommended_action: input.recommendedAction,
      due_at: input.dueAt,
      evidence: readinessEvidence(input),
      status: "missing",
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}

export async function updateReadinessItem(businessId: string, itemId: string, input: ReadinessInput): Promise<void> {
  await authorise(businessId, "funding.manage");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("funding_readiness_items")
    .update({
      category: input.category,
      title: input.title,
      description: input.description,
      missing_information: input.missingInformation,
      recommended_action: input.recommendedAction,
      due_at: input.dueAt,
      evidence: readinessEvidence(input),
      updated_by: (await requireUser()).id,
    })
    .eq("business_id", businessId)
    .eq("id", itemId)
    .select("id");
  if (error) throw error;
  if (!data || data.length === 0) throw notFound("readiness item");
}

/** "Ready" is a person's explicit decision, and records who made it (§22.4). */
export async function setReadinessStatus(businessId: string, itemId: string, status: ReadinessStatus): Promise<void> {
  await authorise(businessId, "funding.manage");
  const supabase = await createClient();
  const user = await requireUser();
  const { data, error } = await supabase
    .from("funding_readiness_items")
    .update({
      status,
      marked_ready_by: status === "ready" ? user.id : null,
      last_reviewed_at: new Date().toISOString(),
      updated_by: user.id,
    })
    .eq("business_id", businessId)
    .eq("id", itemId)
    .select("id");
  if (error) throw error;
  if (!data || data.length === 0) throw notFound("readiness item");
  await audit(businessId, "readiness.status", "funding_readiness_item", itemId, null, { status });
}

export async function deleteReadinessItem(businessId: string, itemId: string): Promise<void> {
  await authorise(businessId, "funding.manage");
  const supabase = await createClient();
  const { error } = await supabase.from("funding_readiness_items").delete().eq("business_id", businessId).eq("id", itemId);
  if (error) throw error;
}

/** Adds the standard items the business does not already have (matched by title). */
export async function addStandardReadinessItems(businessId: string): Promise<number> {
  await authorise(businessId, "funding.manage");
  const supabase = await createClient();
  const { data: existing, error: readError } = await supabase.from("funding_readiness_items").select("title").eq("business_id", businessId);
  if (readError) throw readError;
  const have = new Set(((existing ?? []) as { title: string }[]).map((r) => r.title.toLowerCase()));
  const rows = STANDARD_READINESS_ITEMS.filter((i) => !have.has(i.title.toLowerCase())).map((i) => ({
    business_id: businessId,
    category: i.category,
    title: i.title,
    description: i.description,
    status: "missing",
  }));
  if (rows.length === 0) return 0;
  const { error } = await supabase.from("funding_readiness_items").insert(rows);
  if (error) throw error;
  return rows.length;
}

// ---------------------------------------------------------------------------
// Data room (§29)
// ---------------------------------------------------------------------------

export async function createDataRoomPlaceholder(businessId: string, input: DataRoomItemInput): Promise<string> {
  await authorise(businessId, "funding.manage");
  // RBAC-23 (§34): Data Room changes need their own permission too.
  await requirePermission(businessId, "funding.data_room.manage");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("data_room_items")
    .insert({
      business_id: businessId,
      name: input.name,
      category: input.category,
      round_id: input.roundId,
      description: input.description,
      sensitivity: input.sensitivity,
      expires_at: input.expiresAt,
      status: "missing",
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}

export async function addStandardDataRoomItems(businessId: string): Promise<number> {
  await authorise(businessId, "funding.manage");
  // RBAC-23 (§34): Data Room changes need their own permission too.
  await requirePermission(businessId, "funding.data_room.manage");
  const supabase = await createClient();
  const { data: existing, error: readError } = await supabase
    .from("data_room_items")
    .select("name")
    .eq("business_id", businessId)
    .eq("is_current", true);
  if (readError) throw readError;
  const have = new Set(((existing ?? []) as { name: string }[]).map((r) => r.name.toLowerCase()));
  const rows = STANDARD_DATA_ROOM_ITEMS.filter((i) => !have.has(i.name.toLowerCase())).map((i) => ({
    business_id: businessId,
    name: i.name,
    category: i.category,
    status: "missing",
  }));
  if (rows.length === 0) return 0;
  const { error } = await supabase.from("data_room_items").insert(rows);
  if (error) throw error;
  return rows.length;
}

/**
 * Uploads a document. Into a missing placeholder: fills it (status Draft). Onto an item
 * that already has a file: creates the next version and retires the old row from "current"
 * — the old file and any shares of it are left exactly as they were (§29.7). With no
 * item: creates a new one.
 */
export async function uploadDataRoomFile(
  businessId: string,
  file: File,
  target: { itemId: string } | { item: DataRoomItemInput },
): Promise<string> {
  await authorise(businessId, "funding.manage");
  // RBAC-23 (§34): Data Room changes need their own permission too.
  await requirePermission(businessId, "funding.data_room.manage");
  const check = validateDataRoomFile(file);
  if (!check.ok) throw new FundingError("FILE_INVALID", check.reason);
  const supabase = await createClient();

  let existing: Record<string, unknown> | null = null;
  if ("itemId" in target) {
    const { data, error } = await supabase
      .from("data_room_items")
      .select("id, name, category, round_id, description, sensitivity, expires_at, attachment_id, version, is_current")
      .eq("business_id", businessId)
      .eq("id", target.itemId)
      .maybeSingle();
    if (error) throw error;
    if (!data || !data.is_current) throw notFound("document");
    existing = data;
  }

  const newId = existing && !existing.attachment_id ? (existing.id as string) : crypto.randomUUID();
  const safeName = file.name.replace(/[^\w.\- ]+/g, "_").slice(-150);
  const attachment = await uploadAttachment({
    businessId,
    entityType: "discovery.data_room_item",
    entityId: newId,
    file,
    fileName: safeName,
  });

  try {
    if (existing && !existing.attachment_id) {
      const { error } = await supabase
        .from("data_room_items")
        .update({ attachment_id: attachment.id, status: "draft", updated_by: (await requireUser()).id })
        .eq("business_id", businessId)
        .eq("id", newId);
      if (error) throw error;
      await audit(businessId, "data_room.uploaded", "data_room_item", newId, null, { version: existing.version });
      return newId;
    }
    if (existing) {
      const { error } = await supabase.from("data_room_items").insert({
        id: newId,
        business_id: businessId,
        name: existing.name,
        category: existing.category,
        round_id: existing.round_id,
        description: existing.description,
        sensitivity: existing.sensitivity,
        expires_at: existing.expires_at,
        attachment_id: attachment.id,
        status: "draft",
        version: Number(existing.version) + 1,
        supersedes_id: existing.id,
      });
      if (error) throw error;
      const { error: retireError } = await supabase
        .from("data_room_items")
        .update({ is_current: false })
        .eq("business_id", businessId)
        .eq("id", existing.id as string);
      if (retireError) throw retireError;
      await audit(businessId, "data_room.new_version", "data_room_item", newId, { id: existing.id }, { version: Number(existing.version) + 1 });
      return newId;
    }
    const item = (target as { item: DataRoomItemInput }).item;
    const { error } = await supabase.from("data_room_items").insert({
      id: newId,
      business_id: businessId,
      name: item.name,
      category: item.category,
      round_id: item.roundId,
      description: item.description,
      sensitivity: item.sensitivity,
      expires_at: item.expiresAt,
      attachment_id: attachment.id,
      status: "draft",
    });
    if (error) throw error;
    await audit(businessId, "data_room.uploaded", "data_room_item", newId);
    return newId;
  } catch (error) {
    await deleteAttachment(attachment.id).catch(() => undefined);
    throw error;
  }
}

export async function setDataRoomItemStatus(businessId: string, itemId: string, status: "draft" | "ready" | "expired"): Promise<void> {
  await authorise(businessId, "funding.manage");
  // RBAC-23 (§34): Data Room changes need their own permission too.
  await requirePermission(businessId, "funding.data_room.manage");
  const supabase = await createClient();
  const { data: item, error: readError } = await supabase
    .from("data_room_items")
    .select("status, attachment_id")
    .eq("business_id", businessId)
    .eq("id", itemId)
    .maybeSingle();
  if (readError) throw readError;
  if (!item) throw notFound("document");
  if (!item.attachment_id) throw new FundingError("INVALID_STATE", "Upload the document first.");
  const { error } = await supabase
    .from("data_room_items")
    .update({ status, updated_by: (await requireUser()).id })
    .eq("business_id", businessId)
    .eq("id", itemId);
  if (error) throw error;
  await audit(businessId, `data_room.${status}`, "data_room_item", itemId, { status: item.status }, { status });
}

/** A placeholder or never-shared document can be removed; a shared one is kept for the record. */
export async function deleteDataRoomItem(businessId: string, itemId: string): Promise<void> {
  await authorise(businessId, "funding.manage");
  // RBAC-23 (§34): Data Room changes need their own permission too.
  await requirePermission(businessId, "funding.data_room.manage");
  const supabase = await createClient();
  const { count, error: countError } = await supabase
    .from("data_room_shares")
    .select("id", { count: "exact", head: true })
    .eq("business_id", businessId)
    .eq("data_room_item_id", itemId);
  if (countError) throw countError;
  if ((count ?? 0) > 0) throw new FundingError("INVALID_STATE", "This document has been shared, so it is kept. Mark it expired instead.");
  const { data, error } = await supabase
    .from("data_room_items")
    .delete()
    .eq("business_id", businessId)
    .eq("id", itemId)
    .select("attachment_id, supersedes_id");
  if (error) throw error;
  if (!data || data.length === 0) throw notFound("document");
  // Deleting the current version brings the previous one back as current.
  if (data[0]!.supersedes_id) {
    await supabase.from("data_room_items").update({ is_current: true }).eq("business_id", businessId).eq("id", data[0]!.supersedes_id as string);
  }
  if (data[0]!.attachment_id) await deleteAttachment(data[0]!.attachment_id as string).catch(() => undefined);
  await audit(businessId, "data_room.deleted", "data_room_item", itemId);
}

/**
 * Shares one document with one investor or address, for a limited time (§29.5). Needs
 * `funding.approve`. Returns the link's secret token — shown once and never stored.
 */
export async function shareDataRoomItem(businessId: string, itemId: string, input: ShareInput): Promise<string> {
  await authorise(businessId, "funding.approve");
  // RBAC-23 (§34): sharing with investors is its own, audited permission.
  await requirePermission(businessId, "funding.data_room.share");
  const supabase = await createClient();
  const { data: item, error: readError } = await supabase
    .from("data_room_items")
    .select("status, attachment_id, is_current")
    .eq("business_id", businessId)
    .eq("id", itemId)
    .maybeSingle();
  if (readError) throw readError;
  if (!item) throw notFound("document");
  if (!item.attachment_id || !(item.status === "ready" || item.status === "shared")) {
    throw new FundingError("INVALID_STATE", "Only documents marked Ready can be shared.");
  }
  if (input.investorId) {
    const { data: investor } = await supabase.from("investors").select("id").eq("business_id", businessId).eq("id", input.investorId).maybeSingle();
    if (!investor) throw notFound("investor");
  }
  const { token, hash } = newShareToken();
  const expiresAt = new Date(Date.now() + input.days * 86_400_000).toISOString();
  const { data, error } = await supabase
    .from("data_room_shares")
    .insert({
      business_id: businessId,
      data_room_item_id: itemId,
      investor_id: input.investorId,
      recipient_email: input.recipientEmail,
      permission: input.permission,
      token_hash: hash,
      expires_at: expiresAt,
    })
    .select("id")
    .single();
  if (error) throw error;
  if (item.status !== "shared") {
    await supabase.from("data_room_items").update({ status: "shared" }).eq("business_id", businessId).eq("id", itemId);
  }
  await audit(businessId, "data_room.shared", "data_room_item", itemId, null, {
    shareId: data.id,
    investorId: input.investorId,
    recipientEmail: input.recipientEmail,
    permission: input.permission,
    expiresAt,
  });
  return token;
}

export async function revokeShare(businessId: string, shareId: string): Promise<void> {
  await authorise(businessId, "funding.approve");
  // RBAC-23 (§34): sharing with investors is its own, audited permission.
  await requirePermission(businessId, "funding.data_room.share");
  const supabase = await createClient();
  const user = await requireUser();
  const { data, error } = await supabase
    .from("data_room_shares")
    .update({ revoked_at: new Date().toISOString(), revoked_by: user.id })
    .eq("business_id", businessId)
    .eq("id", shareId)
    .is("revoked_at", null)
    .select("data_room_item_id");
  if (error) throw error;
  if (!data || data.length === 0) throw new FundingError("INVALID_STATE", "That link is already revoked.");
  await audit(businessId, "data_room.share_revoked", "data_room_item", data[0]!.data_room_item_id as string, null, { shareId });
}

// ---------------------------------------------------------------------------
// Due diligence (§30)
// ---------------------------------------------------------------------------

export async function createDiligenceItem(businessId: string, input: DiligenceInput): Promise<string> {
  await authorise(businessId, "funding.manage");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("due_diligence_items")
    .insert({
      business_id: businessId,
      request: input.request,
      requester: input.requester,
      investor_id: input.investorId,
      round_id: input.roundId,
      due_at: input.dueAt,
      status: "open",
    })
    .select("id")
    .single();
  if (error) throw error;
  await audit(businessId, "diligence.created", "due_diligence_item", data.id as string);
  return data.id as string;
}

export async function saveDiligenceResponse(businessId: string, itemId: string, input: DiligenceResponseInput): Promise<void> {
  await authorise(businessId, "funding.manage");
  const supabase = await createClient();
  if (input.dataRoomItemIds.length > 0) {
    // Linked evidence must be this business's own documents.
    const { data: docs, error: docError } = await supabase
      .from("data_room_items")
      .select("id")
      .eq("business_id", businessId)
      .in("id", input.dataRoomItemIds);
    if (docError) throw docError;
    if ((docs ?? []).length !== new Set(input.dataRoomItemIds).size) throw notFound("document");
  }
  const { data, error } = await supabase
    .from("due_diligence_items")
    .update({
      response: input.response,
      notes: input.notes,
      data_room_item_ids: [...new Set(input.dataRoomItemIds)],
      updated_by: (await requireUser()).id,
    })
    .eq("business_id", businessId)
    .eq("id", itemId)
    .not("status", "in", "(accepted,closed)")
    .select("id");
  if (error) throw error;
  if (!data || data.length === 0) throw new FundingError("INVALID_STATE", "Accepted or closed requests are kept as they were.");
}

export async function transitionDiligence(businessId: string, itemId: string, to: DiligenceStatus): Promise<void> {
  await requireModule(businessId, "discovery");
  const supabase = await createClient();
  const { data: item, error: readError } = await supabase
    .from("due_diligence_items")
    .select("status, response")
    .eq("business_id", businessId)
    .eq("id", itemId)
    .maybeSingle();
  if (readError) throw readError;
  if (!item) throw notFound("request");
  const from = item.status as DiligenceStatus;
  const check = checkDiligenceMove(from, to, { response: (item.response as string) ?? null });
  if (!check.ok) throw new FundingError("INVALID_STATE", check.reason);
  await requirePermission(businessId, check.requiresApproval ? "funding.approve" : "funding.manage");
  const user = await requireUser();
  const patch: Record<string, unknown> = { status: to, updated_by: user.id };
  if (check.requiresApproval) {
    patch.decided_by = user.id;
    patch.decided_at = new Date().toISOString();
  }
  const { data, error } = await supabase
    .from("due_diligence_items")
    .update(patch)
    .eq("business_id", businessId)
    .eq("id", itemId)
    .eq("status", from)
    .select("id");
  if (error) throw error;
  if (!data || data.length === 0) throw new FundingError("CONFLICT", "Someone else changed this request. Refresh and try again.");
  await audit(businessId, `diligence.${to}`, "due_diligence_item", itemId, { status: from }, { status: to });
}
