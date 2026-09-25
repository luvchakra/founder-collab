import { z } from "zod";
import { requireModule } from "@cofounderai/core/licensing/queries";
import { requirePermission } from "@cofounderai/core/rbac/require-permission";
import { writeAuditLog } from "@cofounderai/core/audit/mutations";
import { createClient } from "../../db/server";
import { describeContext, getDiscoveryContext } from "../intelligence/context";
import { businessAiInputHash, runBusinessAi } from "../shared/business-ai";
import { OUTREACH_DRAFT_PROMPT_VERSION, outreachDraftPrompt } from "../../prompts/funding/outreach_draft_v1";
import { DILIGENCE_DRAFT_PROMPT_VERSION, diligenceDraftPrompt } from "../../prompts/funding/diligence_draft_v1";
import {
  INVESTOR_RESEARCH_PROMPT_VERSION,
  investorResearchPrompt,
  structureInvestorResearchPrompt,
} from "../../prompts/funding/investor_research_v1";
import { createOutreachDraft, FundingError } from "./mutations";
import { getDiligence, getFundingProfile, getInvestor, getRound, listDataRoomItems, listResearch } from "./queries";
import { RESEARCH_FIELDS, type FundingProfile } from "./types";

/**
 * FND-16 — Funding's AI drafting: outreach drafts, diligence answer drafts and investor
 * research. Each drafts and stops (CLAUDE.md AI rule 3): an outreach draft cannot be sent
 * without approval and a Send click; a diligence draft fills the response box and waits
 * for a person to submit it; research findings are labelled by provenance, and anything
 * without a source URL is stored as AI-inferred, never as fact. AI never marks readiness
 * Ready, never accepts or closes diligence, and never shares a document.
 */

async function authorise(businessId: string): Promise<void> {
  await requireModule(businessId, "discovery");
  await requirePermission(businessId, "funding.manage");
}

export function profileText(p: FundingProfile | null): string {
  if (!p) return "";
  const lines = [
    p.company.summary && `Company: ${p.company.summary}`,
    p.company.geography && `Geography: ${p.company.geography}`,
    p.company.team && `Team: ${p.company.team}`,
    p.product.problem && `Problem: ${p.product.problem}`,
    p.product.differentiation && `Differentiation: ${p.product.differentiation}`,
    p.product.evidence && `Product evidence: ${p.product.evidence}`,
    p.market.targetMarket && `Market: ${p.market.targetMarket}`,
    p.businessModel.revenueModel && `Revenue model: ${p.businessModel.revenueModel}`,
    p.objective.useOfFunds && `Use of funds: ${p.objective.useOfFunds}`,
    ...p.traction.map((t) => `Traction: ${t.metric} = ${t.value}${t.period ? ` (${t.period})` : ""} [source: ${t.source}; ${t.provenance}]`),
  ];
  return lines.filter(Boolean).join("\n");
}

export const OutreachDraftSchema = z.object({
  subject: z.string().min(1).max(200),
  body: z.string().min(1).max(4000),
  cta: z.string().max(300).nullable(),
  personalizationNotes: z.string().max(1000).nullable(),
  usedFindingIds: z.array(z.string()).max(20),
});

export async function draftOutreachWithAi(
  businessId: string,
  input: { investorId: string; roundId: string | null; contactId: string | null },
): Promise<{ id: string; cached: boolean }> {
  await authorise(businessId);
  const [investor, research, profile, round] = await Promise.all([
    getInvestor(businessId, input.investorId),
    listResearch(businessId, input.investorId),
    getFundingProfile(businessId),
    input.roundId ? getRound(businessId, input.roundId) : Promise.resolve(null),
  ]);
  if (!investor) throw new FundingError("NOT_FOUND", "That investor no longer exists.");
  if (!profile) throw new FundingError("INVALID_STATE", "Write the funding profile first — the draft is built from it.");
  const context = await getDiscoveryContext(businessId);

  const findings = research.slice(0, 15).map((r) => ({ id: r.id, field: r.field, provenance: r.provenance, content: r.content }));
  const prompt = outreachDraftPrompt({
    investor: [investor.name, investor.stages.join(", "), investor.sectors.join(", "), investor.notes].filter(Boolean).join("\n"),
    research: findings,
    profile: profileText(profile),
    round: round ? `${round.name} (${round.roundType})${round.useOfFunds ? ` — use of funds: ${round.useOfFunds}` : ""}` : null,
    context: describeContext(context),
  });
  const inputHash = businessAiInputHash(prompt, OUTREACH_DRAFT_PROMPT_VERSION);

  const supabase = await createClient();
  const { data: cached, error } = await supabase
    .from("investor_outreach")
    .select("id")
    .eq("business_id", businessId)
    .eq("investor_id", investor.id)
    .contains("source_evidence", [{ inputHash }])
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (cached) return { id: cached.id as string, cached: true };

  const { object, model } = await runBusinessAi({
    businessId,
    operation: "funding_outreach_draft",
    promptVersion: OUTREACH_DRAFT_PROMPT_VERSION,
    prompt,
    schema: OutreachDraftSchema,
  });
  // The model may only cite findings it was actually given.
  const known = new Map(findings.map((f) => [f.id, f]));
  const used = object.usedFindingIds.filter((id) => known.has(id));
  const id = await createOutreachDraft(
    businessId,
    {
      investorId: investor.id,
      contactId: input.contactId,
      roundId: input.roundId,
      subject: object.subject,
      body: object.body,
      cta: object.cta,
      personalizationNotes: object.personalizationNotes,
    },
    "ai_draft",
    [
      { kind: "ai", inputHash, promptVersion: OUTREACH_DRAFT_PROMPT_VERSION, model, generatedAt: new Date().toISOString() },
      ...used.map((fid) => ({ kind: "record", label: `Research: ${known.get(fid)!.field}`, ref: fid, provenance: known.get(fid)!.provenance })),
    ],
  );
  return { id, cached: false };
}

export const DiligenceDraftSchema = z.object({
  response: z.string().min(1).max(8000),
  gaps: z.array(z.string().min(1).max(300)).max(10),
  confidence: z.number().min(0).max(1),
});

/** Fills an empty response with a draft; never overwrites what a person wrote. */
export async function draftDiligenceResponseWithAi(businessId: string, itemId: string): Promise<{ cached: boolean; gaps: string[] }> {
  await authorise(businessId);
  const item = await getDiligence(businessId, itemId);
  if (!item) throw new FundingError("NOT_FOUND", "That request no longer exists.");
  if (item.status === "accepted" || item.status === "closed") throw new FundingError("INVALID_STATE", "This request is already decided.");
  if (item.response?.trim()) throw new FundingError("INVALID_STATE", "There is already a response. Clear it first if you want an AI draft.");
  const [docs, profile] = await Promise.all([listDataRoomItems(businessId), getFundingProfile(businessId)]);
  const linked = docs.filter((d) => item.dataRoomItemIds.includes(d.id));
  const prompt = diligenceDraftPrompt({
    request: item.request,
    documents: linked.map((d) => `${d.name} (${d.category}, ${d.status})${d.description ? `: ${d.description}` : ""}`).join("\n"),
    profile: profileText(profile),
  });
  const inputHash = businessAiInputHash(prompt, DILIGENCE_DRAFT_PROMPT_VERSION);

  const { object, model } = await runBusinessAi({
    businessId,
    operation: "funding_diligence_draft",
    promptVersion: DILIGENCE_DRAFT_PROMPT_VERSION,
    prompt,
    schema: DiligenceDraftSchema,
  });
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("due_diligence_items")
    .update({
      response: object.response,
      evidence: [
        { kind: "ai", inputHash, promptVersion: DILIGENCE_DRAFT_PROMPT_VERSION, model, confidence: object.confidence, gaps: object.gaps, generatedAt: new Date().toISOString() },
      ],
    })
    .eq("business_id", businessId)
    .eq("id", itemId)
    .is("response", null)
    .not("status", "in", "(accepted,closed)")
    .select("id");
  if (error) throw error;
  if (!data || data.length === 0) throw new FundingError("CONFLICT", "Someone wrote a response meanwhile. Refresh to see it.");
  await writeAuditLog({ businessId, action: "funding.diligence.ai_drafted", entityType: "due_diligence_item", entityId: itemId, after: { model } });
  return { cached: false, gaps: object.gaps };
}

export const InvestorResearchSchema = z.object({
  findings: z
    .array(
      z.object({
        field: z.enum(RESEARCH_FIELDS),
        content: z.string().min(1).max(2000),
        sourceUrl: z.string().max(2000).nullable(),
        sourceTitle: z.string().max(300).nullable(),
      }),
    )
    .max(20),
});

/** Research is not repeated more often than this for one investor. */
export const AI_RESEARCH_COOLDOWN_DAYS = 7;

/**
 * Researches one investor on the web and stores each finding with its provenance. A
 * finding counts as source-backed only when it carries an http(s) URL that actually
 * appeared in the research notes; otherwise it is stored as AI-inferred.
 */
export async function researchInvestorWithAi(businessId: string, investorId: string): Promise<{ added: number; sourced: number }> {
  await authorise(businessId);
  const investor = await getInvestor(businessId, investorId);
  if (!investor) throw new FundingError("NOT_FOUND", "That investor no longer exists.");
  if (investor.lastResearchedAt) {
    const ageDays = (Date.now() - new Date(investor.lastResearchedAt).getTime()) / 86_400_000;
    const existing = await listResearch(businessId, investorId);
    if (ageDays < AI_RESEARCH_COOLDOWN_DAYS && existing.some((r) => r.provenance !== "user_entered")) {
      throw new FundingError("INVALID_STATE", `Researched ${Math.floor(ageDays)} day(s) ago. Try again after ${AI_RESEARCH_COOLDOWN_DAYS} days.`);
    }
  }

  let notes = "";
  const { object } = await runBusinessAi({
    businessId,
    operation: "funding_investor_research",
    promptVersion: INVESTOR_RESEARCH_PROMPT_VERSION,
    prompt: "",
    schema: InvestorResearchSchema,
    research: {
      prompt: investorResearchPrompt({ name: investor.name, website: investor.website }),
      toStructurePrompt: (findings) => {
        notes = findings;
        return structureInvestorResearchPrompt(findings);
      },
    },
  });

  const rows = object.findings.map((f) => {
    const url = f.sourceUrl && /^https?:\/\//i.test(f.sourceUrl) && notes.includes(f.sourceUrl) ? f.sourceUrl : null;
    return {
      business_id: businessId,
      investor_id: investorId,
      field: f.field,
      content: f.content,
      provenance: url ? "source_backed" : "ai_inferred",
      source_url: url,
      source_title: url ? f.sourceTitle : null,
    };
  });
  if (rows.length === 0) return { added: 0, sourced: 0 };
  const supabase = await createClient();
  const { error } = await supabase.from("investor_research").insert(rows);
  if (error) throw error;
  const { error: updateError } = await supabase
    .from("investors")
    .update({ research_status: "researched", last_researched_at: new Date().toISOString() })
    .eq("business_id", businessId)
    .eq("id", investorId);
  if (updateError) throw updateError;
  await writeAuditLog({ businessId, action: "funding.investor.ai_researched", entityType: "investor", entityId: investorId, after: { findings: rows.length } });
  return { added: rows.length, sourced: rows.filter((r) => r.provenance === "source_backed").length };
}
