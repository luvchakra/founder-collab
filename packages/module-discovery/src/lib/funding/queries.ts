import { cache } from "react";
import { createClient } from "../../db/server";
import { createClient as createCoreClient } from "@cofounderai/core/db/server";
import type {
  DataRoomItem,
  DataRoomShare,
  DiligenceItem,
  DiligenceStatus,
  FundingProfile,
  FundingRound,
  Interaction,
  InteractionType,
  Investor,
  InvestorContact,
  OutreachDraft,
  OutreachStatus,
  PipelineRecord,
  ReadinessItem,
  ResearchFinding,
  StageChange,
} from "./types";

/**
 * FND-01 — the Funding read layer. Every query names the business explicitly and runs
 * through the caller's RLS-bound client, whose policies also require `funding.view`, so
 * a member without it simply gets nothing back. Pages call these; components never do.
 */

type Row = Record<string, unknown>;

function num(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
const str = (v: unknown) => (v === null || v === undefined ? null : (v as string));

// ---------------------------------------------------------------------------
// Profile and rounds
// ---------------------------------------------------------------------------

export const getFundingProfile = cache(async (businessId: string): Promise<FundingProfile | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase.from("funding_profiles").select("*").eq("business_id", businessId).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const r = data as Row;
  return {
    id: r.id as string,
    company: (r.company as FundingProfile["company"]) ?? {},
    product: (r.product as FundingProfile["product"]) ?? {},
    market: (r.market as FundingProfile["market"]) ?? {},
    traction: (r.traction as FundingProfile["traction"]) ?? [],
    businessModel: (r.business_model as FundingProfile["businessModel"]) ?? {},
    objective: (r.objective as FundingProfile["objective"]) ?? {},
    updatedAt: r.updated_at as string,
  };
});

function mapRound(r: Row): FundingRound {
  return {
    id: r.id as string,
    name: r.name as string,
    roundType: r.round_type as FundingRound["roundType"],
    status: r.status as FundingRound["status"],
    isPrimary: Boolean(r.is_primary),
    targetAmount: num(r.target_amount),
    minimumAmount: num(r.minimum_amount),
    maximumAmount: num(r.maximum_amount),
    currency: str(r.currency),
    instrument: str(r.instrument),
    preMoneyValuation: num(r.pre_money_valuation),
    postMoneyValuation: num(r.post_money_valuation),
    targetCloseDate: str(r.target_close_date),
    actualCloseDate: str(r.actual_close_date),
    openedAt: str(r.opened_at),
    useOfFunds: str(r.use_of_funds),
    notes: str(r.notes),
    createdAt: r.created_at as string,
  };
}

export const listRounds = cache(async (businessId: string): Promise<FundingRound[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("funding_rounds")
    .select("*")
    .eq("business_id", businessId)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw error;
  return ((data ?? []) as Row[]).map(mapRound);
});

export const getRound = cache(async (businessId: string, roundId: string): Promise<FundingRound | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase.from("funding_rounds").select("*").eq("business_id", businessId).eq("id", roundId).maybeSingle();
  if (error) throw error;
  return data ? mapRound(data as Row) : null;
});

/** The round the dashboard is about: the live primary one, else the newest live one. */
export function pickActiveRound(rounds: FundingRound[]): FundingRound | null {
  const live = rounds.filter((r) => r.status === "open" || r.status === "paused" || r.status === "planning");
  return live.find((r) => r.isPrimary) ?? live[0] ?? null;
}

// ---------------------------------------------------------------------------
// Investors — firm facts live on core.parties (name, email), contacts on party_contacts
// ---------------------------------------------------------------------------

async function partiesById(businessId: string, ids: string[]): Promise<Map<string, Row>> {
  if (ids.length === 0) return new Map();
  const core = await createCoreClient({ schema: "core" });
  const { data, error } = await core.from("parties").select("id, name, email").eq("business_id", businessId).in("id", ids);
  if (error) throw error;
  return new Map(((data ?? []) as Row[]).map((p) => [p.id as string, p]));
}

function mapInvestor(r: Row, party: Row | undefined): Investor {
  return {
    id: r.id as string,
    partyId: r.party_id as string,
    name: (party?.name as string) ?? "Unknown investor",
    email: str(party?.email),
    investorType: r.investor_type as Investor["investorType"],
    website: str(r.website),
    geographies: (r.geographies as string[]) ?? [],
    stages: (r.stages as string[]) ?? [],
    sectors: (r.sectors as string[]) ?? [],
    checkMin: num(r.check_min),
    checkMax: num(r.check_max),
    currency: str(r.currency),
    source: r.source as Investor["source"],
    sourceNote: str(r.source_note),
    notes: str(r.notes),
    status: r.status as Investor["status"],
    researchStatus: r.research_status as Investor["researchStatus"],
    lastResearchedAt: str(r.last_researched_at),
    createdAt: r.created_at as string,
  };
}

export const listInvestors = cache(
  async (businessId: string, status: "active" | "archived" | "all" = "active"): Promise<Investor[]> => {
    const supabase = await createClient();
    let query = supabase.from("investors").select("*").eq("business_id", businessId);
    if (status !== "all") query = query.eq("status", status);
    const { data, error } = await query.order("created_at", { ascending: false }).limit(1000);
    if (error) throw error;
    const rows = (data ?? []) as Row[];
    const parties = await partiesById(
      businessId,
      rows.map((r) => r.party_id as string),
    );
    return rows.map((r) => mapInvestor(r, parties.get(r.party_id as string))).sort((a, b) => a.name.localeCompare(b.name));
  },
);

export const getInvestor = cache(async (businessId: string, investorId: string): Promise<Investor | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase.from("investors").select("*").eq("business_id", businessId).eq("id", investorId).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const parties = await partiesById(businessId, [(data as Row).party_id as string]);
  return mapInvestor(data as Row, parties.get((data as Row).party_id as string));
});

export const listInvestorContacts = cache(async (businessId: string, partyId: string): Promise<InvestorContact[]> => {
  const core = await createCoreClient({ schema: "core" });
  const { data, error } = await core
    .from("party_contacts")
    .select("id, first_name, last_name, job_title, email, linkedin_url, is_primary")
    .eq("business_id", businessId)
    .eq("party_id", partyId)
    .eq("status", "active")
    .order("is_primary", { ascending: false });
  if (error) throw error;
  return ((data ?? []) as Row[]).map((c) => ({
    id: c.id as string,
    name: [c.first_name, c.last_name].filter(Boolean).join(" ") || "Unnamed contact",
    jobTitle: str(c.job_title),
    email: str(c.email),
    linkedinUrl: str(c.linkedin_url),
    isPrimary: Boolean(c.is_primary),
  }));
});

export const listResearch = cache(async (businessId: string, investorId: string): Promise<ResearchFinding[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("investor_research")
    .select("*")
    .eq("business_id", businessId)
    .eq("investor_id", investorId)
    .order("observed_at", { ascending: false });
  if (error) throw error;
  return ((data ?? []) as Row[]).map((r) => ({
    id: r.id as string,
    investorId: r.investor_id as string,
    field: r.field as ResearchFinding["field"],
    content: r.content as string,
    provenance: r.provenance as ResearchFinding["provenance"],
    sourceUrl: str(r.source_url),
    sourceTitle: str(r.source_title),
    observedAt: r.observed_at as string,
  }));
});

// ---------------------------------------------------------------------------
// Pipeline
// ---------------------------------------------------------------------------

async function investorNames(businessId: string, investorIds: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(investorIds)];
  if (unique.length === 0) return new Map();
  const supabase = await createClient();
  const { data, error } = await supabase.from("investors").select("id, party_id").eq("business_id", businessId).in("id", unique);
  if (error) throw error;
  const rows = (data ?? []) as Row[];
  const parties = await partiesById(
    businessId,
    rows.map((r) => r.party_id as string),
  );
  return new Map(rows.map((r) => [r.id as string, (parties.get(r.party_id as string)?.name as string) ?? "Unknown investor"]));
}

function mapPipeline(r: Row, names: Map<string, string>): PipelineRecord {
  return {
    id: r.id as string,
    investorId: r.investor_id as string,
    investorName: names.get(r.investor_id as string) ?? "Unknown investor",
    roundId: r.round_id as string,
    stage: r.stage as PipelineRecord["stage"],
    previousStage: (r.previous_stage as PipelineRecord["previousStage"]) ?? null,
    stageEnteredAt: r.stage_entered_at as string,
    nextAction: str(r.next_action),
    nextActionDue: str(r.next_action_due),
    fitSummary: str(r.fit_summary),
    notes: str(r.notes),
    committedAmount: num(r.committed_amount),
    investedAmount: num(r.invested_amount),
    currency: str(r.currency),
    passReason: str(r.pass_reason),
    lastInteractionAt: str(r.last_interaction_at),
  };
}

export const listPipeline = cache(
  async (businessId: string, filter: { roundId?: string; investorId?: string } = {}): Promise<PipelineRecord[]> => {
    const supabase = await createClient();
    let query = supabase.from("investor_pipeline").select("*").eq("business_id", businessId);
    if (filter.roundId) query = query.eq("round_id", filter.roundId);
    if (filter.investorId) query = query.eq("investor_id", filter.investorId);
    const { data, error } = await query.order("stage_entered_at", { ascending: false }).limit(2000);
    if (error) throw error;
    const rows = (data ?? []) as Row[];
    const names = await investorNames(
      businessId,
      rows.map((r) => r.investor_id as string),
    );
    return rows.map((r) => mapPipeline(r, names));
  },
);

export const getPipelineRecord = cache(async (businessId: string, pipelineId: string): Promise<PipelineRecord | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase.from("investor_pipeline").select("*").eq("business_id", businessId).eq("id", pipelineId).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const names = await investorNames(businessId, [(data as Row).investor_id as string]);
  return mapPipeline(data as Row, names);
});

export const listStageHistory = cache(async (businessId: string, roundId?: string): Promise<StageChange[]> => {
  const supabase = await createClient();
  let query = supabase.from("investor_stage_history").select("pipeline_id, from_stage, to_stage, changed_at").eq("business_id", businessId);
  if (roundId) query = query.eq("round_id", roundId);
  const { data, error } = await query.order("changed_at", { ascending: true }).limit(10000);
  if (error) throw error;
  return ((data ?? []) as Row[]).map((r) => ({
    pipelineId: r.pipeline_id as string,
    fromStage: (r.from_stage as StageChange["fromStage"]) ?? null,
    toStage: r.to_stage as StageChange["toStage"],
    changedAt: r.changed_at as string,
  }));
});

// ---------------------------------------------------------------------------
// Interactions and outreach
// ---------------------------------------------------------------------------

export const listInteractions = cache(
  async (
    businessId: string,
    filter: { investorId?: string; roundId?: string; type?: InteractionType } = {},
  ): Promise<Interaction[]> => {
    const supabase = await createClient();
    let query = supabase.from("investor_interactions").select("*").eq("business_id", businessId);
    if (filter.investorId) query = query.eq("investor_id", filter.investorId);
    if (filter.roundId) query = query.eq("round_id", filter.roundId);
    if (filter.type) query = query.eq("interaction_type", filter.type);
    const { data, error } = await query.order("occurred_at", { ascending: false }).limit(500);
    if (error) throw error;
    const rows = (data ?? []) as Row[];
    const names = await investorNames(
      businessId,
      rows.map((r) => r.investor_id as string),
    );
    return rows.map((r) => ({
      id: r.id as string,
      investorId: r.investor_id as string,
      investorName: names.get(r.investor_id as string) ?? null,
      contactId: str(r.contact_id),
      roundId: str(r.round_id),
      interactionType: r.interaction_type as InteractionType,
      occurredAt: r.occurred_at as string,
      subject: str(r.subject),
      notes: str(r.notes),
      outcome: str(r.outcome),
      nextAction: str(r.next_action),
      nextActionDue: str(r.next_action_due),
      source: r.source as Interaction["source"],
    }));
  },
);

function mapOutreach(r: Row, names: Map<string, string>): OutreachDraft {
  return {
    id: r.id as string,
    investorId: r.investor_id as string,
    investorName: names.get(r.investor_id as string) ?? null,
    contactId: str(r.contact_id),
    roundId: str(r.round_id),
    subject: r.subject as string,
    body: r.body as string,
    personalizationNotes: str(r.personalization_notes),
    cta: str(r.cta),
    status: r.status as OutreachStatus,
    origin: r.origin as OutreachDraft["origin"],
    approvedAt: str(r.approved_at),
    recipientEmail: str(r.recipient_email),
    sentAt: str(r.sent_at),
    providerMessageId: str(r.provider_message_id),
    failureReason: str(r.failure_reason),
    updatedAt: r.updated_at as string,
  };
}

export const listOutreach = cache(
  async (businessId: string, filter: { status?: OutreachStatus; investorId?: string } = {}): Promise<OutreachDraft[]> => {
    const supabase = await createClient();
    let query = supabase.from("investor_outreach").select("*").eq("business_id", businessId);
    if (filter.status) query = query.eq("status", filter.status);
    if (filter.investorId) query = query.eq("investor_id", filter.investorId);
    const { data, error } = await query.order("updated_at", { ascending: false }).limit(500);
    if (error) throw error;
    const rows = (data ?? []) as Row[];
    const names = await investorNames(
      businessId,
      rows.map((r) => r.investor_id as string),
    );
    return rows.map((r) => mapOutreach(r, names));
  },
);

export const getOutreach = cache(async (businessId: string, outreachId: string): Promise<OutreachDraft | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase.from("investor_outreach").select("*").eq("business_id", businessId).eq("id", outreachId).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const names = await investorNames(businessId, [(data as Row).investor_id as string]);
  return mapOutreach(data as Row, names);
});

// ---------------------------------------------------------------------------
// Readiness, data room, diligence
// ---------------------------------------------------------------------------

export const listReadinessItems = cache(async (businessId: string): Promise<ReadinessItem[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("funding_readiness_items")
    .select("*")
    .eq("business_id", businessId)
    .order("category")
    .order("created_at")
    .limit(1000);
  if (error) throw error;
  return ((data ?? []) as Row[]).map((r) => ({
    id: r.id as string,
    category: r.category as ReadinessItem["category"],
    title: r.title as string,
    description: str(r.description),
    status: r.status as ReadinessItem["status"],
    evidence: (r.evidence as ReadinessItem["evidence"]) ?? [],
    missingInformation: str(r.missing_information),
    recommendedAction: str(r.recommended_action),
    dueAt: str(r.due_at),
    lastReviewedAt: str(r.last_reviewed_at),
    updatedAt: r.updated_at as string,
  }));
});

export const listDataRoomItems = cache(
  async (businessId: string, opts: { includeSuperseded?: boolean } = {}): Promise<DataRoomItem[]> => {
    const supabase = await createClient();
    let query = supabase.from("data_room_items").select("*").eq("business_id", businessId);
    if (!opts.includeSuperseded) query = query.eq("is_current", true);
    const { data, error } = await query.order("category").order("name").limit(1000);
    if (error) throw error;
    const rows = (data ?? []) as Row[];
    const attachmentIds = rows.map((r) => r.attachment_id as string | null).filter((v): v is string => Boolean(v));
    const files = new Map<string, Row>();
    if (attachmentIds.length > 0) {
      const core = await createCoreClient({ schema: "core" });
      const { data: atts, error: attError } = await core
        .from("attachments")
        .select("id, file_name, content_type, size_bytes, storage_bucket, storage_path")
        .eq("business_id", businessId)
        .in("id", attachmentIds);
      if (attError) throw attError;
      for (const a of (atts ?? []) as Row[]) files.set(a.id as string, a);
    }
    return rows.map((r) => {
      const a = r.attachment_id ? files.get(r.attachment_id as string) : undefined;
      return {
        id: r.id as string,
        roundId: str(r.round_id),
        name: r.name as string,
        category: r.category as DataRoomItem["category"],
        attachmentId: str(r.attachment_id),
        fileName: str(a?.file_name),
        contentType: str(a?.content_type),
        sizeBytes: num(a?.size_bytes),
        storageBucket: str(a?.storage_bucket),
        storagePath: str(a?.storage_path),
        status: r.status as DataRoomItem["status"],
        description: str(r.description),
        version: Number(r.version),
        supersedesId: str(r.supersedes_id),
        isCurrent: Boolean(r.is_current),
        sensitivity: r.sensitivity as DataRoomItem["sensitivity"],
        expiresAt: str(r.expires_at),
        updatedAt: r.updated_at as string,
      };
    });
  },
);

export const listShares = cache(async (businessId: string): Promise<DataRoomShare[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("data_room_shares")
    .select("id, data_room_item_id, investor_id, recipient_email, permission, shared_at, expires_at, revoked_at")
    .eq("business_id", businessId)
    .order("shared_at", { ascending: false })
    .limit(1000);
  if (error) throw error;
  const rows = (data ?? []) as Row[];
  const { data: events, error: eventsError } = await supabase
    .from("data_room_access_events")
    .select("share_id, accessed_at")
    .eq("business_id", businessId)
    .order("accessed_at", { ascending: false })
    .limit(5000);
  if (eventsError) throw eventsError;
  const counts = new Map<string, { n: number; last: string }>();
  for (const e of (events ?? []) as Row[]) {
    const c = counts.get(e.share_id as string);
    if (c) c.n += 1;
    else counts.set(e.share_id as string, { n: 1, last: e.accessed_at as string });
  }
  const names = await investorNames(
    businessId,
    rows.map((r) => r.investor_id as string).filter(Boolean),
  );
  return rows.map((r) => ({
    id: r.id as string,
    dataRoomItemId: r.data_room_item_id as string,
    investorId: str(r.investor_id),
    investorName: r.investor_id ? (names.get(r.investor_id as string) ?? null) : null,
    recipientEmail: str(r.recipient_email),
    permission: r.permission as DataRoomShare["permission"],
    sharedAt: r.shared_at as string,
    expiresAt: r.expires_at as string,
    revokedAt: str(r.revoked_at),
    accessCount: counts.get(r.id as string)?.n ?? 0,
    lastAccessedAt: counts.get(r.id as string)?.last ?? null,
  }));
});

/** Short-lived links for the founder's own preview/download of data-room files. */
export async function dataRoomSignedUrls(items: DataRoomItem[], expiresInSeconds = 600): Promise<Map<string, string>> {
  const urls = new Map<string, string>();
  const withFile = items.filter((i) => i.storageBucket && i.storagePath);
  if (withFile.length === 0) return urls;
  const core = await createCoreClient({ schema: "core" });
  const byBucket = new Map<string, DataRoomItem[]>();
  for (const i of withFile) byBucket.set(i.storageBucket!, [...(byBucket.get(i.storageBucket!) ?? []), i]);
  for (const [bucket, list] of byBucket) {
    const { data, error } = await core.storage.from(bucket).createSignedUrls(
      list.map((i) => i.storagePath!),
      expiresInSeconds,
    );
    if (error) throw error;
    for (const [idx, entry] of (data ?? []).entries()) if (entry.signedUrl) urls.set(list[idx]!.id, entry.signedUrl);
  }
  return urls;
}

function mapDiligence(r: Row, names: Map<string, string>): DiligenceItem {
  return {
    id: r.id as string,
    investorId: str(r.investor_id),
    investorName: r.investor_id ? (names.get(r.investor_id as string) ?? null) : null,
    roundId: str(r.round_id),
    request: r.request as string,
    requester: str(r.requester),
    dueAt: str(r.due_at),
    status: r.status as DiligenceStatus,
    response: str(r.response),
    notes: str(r.notes),
    dataRoomItemIds: (r.data_room_item_ids as string[]) ?? [],
    decidedAt: str(r.decided_at),
    updatedAt: r.updated_at as string,
  };
}

export const listDiligence = cache(async (businessId: string, status?: DiligenceStatus | "active"): Promise<DiligenceItem[]> => {
  const supabase = await createClient();
  let query = supabase.from("due_diligence_items").select("*").eq("business_id", businessId);
  if (status === "active") query = query.not("status", "in", "(accepted,closed)");
  else if (status) query = query.eq("status", status);
  const { data, error } = await query.order("due_at", { ascending: true, nullsFirst: false }).limit(1000);
  if (error) throw error;
  const rows = (data ?? []) as Row[];
  const names = await investorNames(
    businessId,
    rows.map((r) => r.investor_id as string).filter(Boolean),
  );
  return rows.map((r) => mapDiligence(r, names));
});

export const getDiligence = cache(async (businessId: string, id: string): Promise<DiligenceItem | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase.from("due_diligence_items").select("*").eq("business_id", businessId).eq("id", id).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const names = await investorNames(businessId, [(data as Row).investor_id as string].filter(Boolean));
  return mapDiligence(data as Row, names);
});

export { listEntityActivity } from "../marketing/queries";
