import { createClient as createCoreClient } from "@cofounderai/core/db/server";
import { fetchAllRows } from "@cofounderai/core/exports/fetch-all";
import { createClient } from "../../db/server";
import type { DataRoomItem, Investor, OutreachDraft, OutreachStatus } from "../../lib/funding/types";

/**
 * EXP-FND-05/06/07/08/09 -- export-only Funding reads (data-exports.md rule 1). The pages'
 * loaders in lib/funding/queries.ts are bounded for the screen -- investors at 1,000,
 * outreach at 500 -- and an export of "all matching records" must not stop there
 * silently. Each function applies exactly the predicates of the loader it shadows
 * (business filter, status filter, same final order), pages with `fetchAllRows` on a
 * stable order ending in `id`, and runs through the same RLS-bound client, whose
 * policies also require `funding.view`. The loaders themselves are protected Discovery
 * code and are left untouched.
 */

type Row = Record<string, unknown>;

function num(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
const str = (v: unknown) => (v === null || v === undefined ? null : (v as string));

const ID_SLICE = 150;
function slices<T>(items: T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += ID_SLICE) out.push(items.slice(i, i + ID_SLICE));
  return out;
}

/** Firm facts (name, email) live on core.parties -- read for this business only. */
async function partiesById(businessId: string, ids: string[]): Promise<Map<string, Row>> {
  const unique = [...new Set(ids.filter(Boolean))];
  const out = new Map<string, Row>();
  if (unique.length === 0) return out;
  const core = await createCoreClient({ schema: "core" });
  for (const slice of slices(unique)) {
    const { data, error } = await core.from("parties").select("id, name, email").eq("business_id", businessId).in("id", slice);
    if (error) throw error;
    for (const p of (data ?? []) as Row[]) out.set(p.id as string, p);
  }
  return out;
}

async function investorNames(businessId: string, investorIds: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(investorIds.filter(Boolean))];
  if (unique.length === 0) return new Map();
  const supabase = await createClient();
  const rows: Row[] = [];
  for (const slice of slices(unique)) {
    const { data, error } = await supabase.from("investors").select("id, party_id").eq("business_id", businessId).in("id", slice);
    if (error) throw error;
    rows.push(...((data ?? []) as Row[]));
  }
  const parties = await partiesById(
    businessId,
    rows.map((r) => r.party_id as string),
  );
  return new Map(rows.map((r) => [r.id as string, (parties.get(r.party_id as string)?.name as string) ?? "Unknown investor"]));
}

/** Same predicates as `listInvestors` (business, optional status), without its 1,000-row
 * bound; sorted by name exactly as the loader returns them. */
export async function listInvestorsForExport(businessId: string, status: "active" | "archived" | "all" = "active"): Promise<Investor[]> {
  const supabase = await createClient();
  const rows = await fetchAllRows<Row>((from, to) => {
    let query = supabase.from("investors").select("*").eq("business_id", businessId);
    if (status !== "all") query = query.eq("status", status);
    return query.order("created_at", { ascending: false }).order("id", { ascending: true }).range(from, to);
  });
  const parties = await partiesById(
    businessId,
    rows.map((r) => r.party_id as string),
  );
  return rows
    .map((r): Investor => {
      const party = parties.get(r.party_id as string);
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
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

export type PrimaryContact = { name: string; email: string | null; jobTitle: string | null };

/** Each investor firm's primary active contact (core.party_contacts, the platform's shared
 * contact records) -- one batched read for the list, rather than one per investor. */
export async function primaryContactsForExport(businessId: string, partyIds: string[]): Promise<Map<string, PrimaryContact>> {
  const unique = [...new Set(partyIds.filter(Boolean))];
  const out = new Map<string, PrimaryContact>();
  if (unique.length === 0) return out;
  const core = await createCoreClient({ schema: "core" });
  for (const slice of slices(unique)) {
    const { data, error } = await core
      .from("party_contacts")
      .select("party_id, first_name, last_name, job_title, email")
      .eq("business_id", businessId)
      .eq("status", "active")
      .eq("is_primary", true)
      .in("party_id", slice);
    if (error) throw error;
    for (const c of (data ?? []) as Row[]) {
      if (out.has(c.party_id as string)) continue;
      out.set(c.party_id as string, {
        name: [c.first_name, c.last_name].filter(Boolean).join(" ") || "Unnamed contact",
        email: str(c.email),
        jobTitle: str(c.job_title),
      });
    }
  }
  return out;
}

export type OutreachExportRow = OutreachDraft & { createdAt: string | null };

/** Same predicates and order as `listOutreach` (business, optional status), without its
 * 500-row bound, plus the record's creation time. The provider's message id is never
 * mapped: it identifies a message at the email provider and has no use in a file. */
export async function listOutreachForExport(businessId: string, filter: { status?: OutreachStatus } = {}): Promise<OutreachExportRow[]> {
  const supabase = await createClient();
  const rows = await fetchAllRows<Row>((from, to) => {
    let query = supabase.from("investor_outreach").select("*").eq("business_id", businessId);
    if (filter.status) query = query.eq("status", filter.status);
    return query.order("updated_at", { ascending: false }).order("id", { ascending: true }).range(from, to);
  });
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
    subject: r.subject as string,
    body: r.body as string,
    personalizationNotes: str(r.personalization_notes),
    cta: str(r.cta),
    status: r.status as OutreachStatus,
    origin: r.origin as OutreachDraft["origin"],
    approvedAt: str(r.approved_at),
    recipientEmail: str(r.recipient_email),
    sentAt: str(r.sent_at),
    providerMessageId: null,
    failureReason: str(r.failure_reason),
    updatedAt: r.updated_at as string,
    createdAt: str(r.created_at),
  }));
}

export type DataRoomExportRow = {
  id: string;
  roundId: string | null;
  name: string;
  category: DataRoomItem["category"];
  fileName: string | null;
  contentType: string | null;
  sizeBytes: number | null;
  /** When the file behind this version was uploaded; null for a placeholder. */
  uploadedAt: string | null;
  status: DataRoomItem["status"];
  description: string | null;
  version: number;
  supersedesId: string | null;
  isCurrent: boolean;
  sensitivity: DataRoomItem["sensitivity"];
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
};

/**
 * EXP-FND-09 -- the data room as metadata only. Same predicates and order as the page's
 * `listDataRoomItems(businessId, { includeSuperseded: true })`, paged, and -- unlike the
 * loader, which needs them to sign preview links -- it never selects the storage bucket
 * or path, so no location of a document's bytes can reach the file.
 */
export async function listDataRoomItemsForExport(businessId: string): Promise<DataRoomExportRow[]> {
  const supabase = await createClient();
  const rows = await fetchAllRows<Row>((from, to) =>
    supabase
      .from("data_room_items")
      .select("id, round_id, name, category, attachment_id, status, description, version, supersedes_id, is_current, sensitivity, expires_at, created_at, updated_at")
      .eq("business_id", businessId)
      .order("category")
      .order("name")
      .order("id", { ascending: true })
      .range(from, to),
  );
  const attachmentIds = rows.map((r) => r.attachment_id as string | null).filter((v): v is string => Boolean(v));
  const files = new Map<string, Row>();
  if (attachmentIds.length > 0) {
    const core = await createCoreClient({ schema: "core" });
    for (const slice of slices(attachmentIds)) {
      const { data, error } = await core
        .from("attachments")
        .select("id, file_name, content_type, size_bytes, created_at")
        .eq("business_id", businessId)
        .in("id", slice);
      if (error) throw error;
      for (const a of (data ?? []) as Row[]) files.set(a.id as string, a);
    }
  }
  return rows.map((r) => {
    const a = r.attachment_id ? files.get(r.attachment_id as string) : undefined;
    return {
      id: r.id as string,
      roundId: str(r.round_id),
      name: r.name as string,
      category: r.category as DataRoomItem["category"],
      fileName: str(a?.file_name),
      contentType: str(a?.content_type),
      sizeBytes: num(a?.size_bytes),
      uploadedAt: str(a?.created_at),
      status: r.status as DataRoomItem["status"],
      description: str(r.description),
      version: Number(r.version),
      supersedesId: str(r.supersedes_id),
      isCurrent: Boolean(r.is_current),
      sensitivity: r.sensitivity as DataRoomItem["sensitivity"],
      expiresAt: str(r.expires_at),
      createdAt: r.created_at as string,
      updatedAt: r.updated_at as string,
    };
  });
}
