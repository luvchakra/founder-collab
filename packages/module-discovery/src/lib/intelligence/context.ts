import { cache } from "react";
import { createClient } from "../../db/server";
import { getBusiness } from "../tenancy/queries";
import type { Evidence } from "./types";

/**
 * INT-01 — Discovery's typed read model for AI context: the business, its offerings with
 * their positioning, each offering's ICP, and headline counts from acquisition, marketing
 * and funding. It reads the source tables and copies nothing (§57 "do not replace source
 * tables"); every section records where it came from so a prompt can cite it and a draft
 * can carry the evidence.
 */
export interface DiscoveryContext {
  business: { id: string; name: string; website: string | null; description: string | null; industry: string | null };
  offerings: {
    id: string;
    name: string;
    description: string | null;
    valueProposition: string | null;
    primaryProblem: string | null;
    targetMarket: string | null;
    icp: { industries: string[]; roles: string[]; painPoints: string[]; geographies: string[] } | null;
  }[];
  counts: { prospects: number | null; activeCampaigns: number | null; publishedContent: number | null; investors: number | null };
  evidence: Evidence[];
}

type Row = Record<string, unknown>;
const arr = (v: unknown) => (Array.isArray(v) ? (v as string[]) : []);

export const getDiscoveryContext = cache(async (businessId: string, opts: { offeringId?: string | null } = {}): Promise<DiscoveryContext> => {
  const supabase = await createClient();
  const business = await getBusiness(businessId);
  let productsQuery = supabase
    .from("products")
    .select("id, name, description, value_proposition, primary_problem, target_market, status")
    .eq("business_id", businessId)
    .neq("status", "archived");
  if (opts.offeringId) productsQuery = productsQuery.eq("id", opts.offeringId);
  const { data: products, error } = await productsQuery.limit(20);
  if (error) throw error;
  const productRows = (products ?? []) as Row[];

  const productIds = productRows.map((p) => p.id as string);
  const { data: workspaces } = productIds.length
    ? await supabase.from("workspaces").select("id, product_id").in("product_id", productIds)
    : { data: [] as Row[] };
  const workspaceByProduct = new Map(((workspaces ?? []) as Row[]).map((w) => [w.product_id as string, w.id as string]));
  const workspaceIds = [...workspaceByProduct.values()];
  const { data: icps } = workspaceIds.length
    ? await supabase.from("icp_profiles").select("workspace_id, industries, roles, pain_points, geographies").in("workspace_id", workspaceIds)
    : { data: [] as Row[] };
  const icpByWorkspace = new Map(((icps ?? []) as Row[]).map((i) => [i.workspace_id as string, i]));

  const headCount = async (query: PromiseLike<{ count: number | null; error: unknown }>): Promise<number | null> => {
    const { count, error: countError } = await query;
    return countError ? null : count;
  };
  const [prospects, activeCampaigns, publishedContent, investors] = await Promise.all([
    workspaceIds.length
      ? headCount(supabase.from("prospects").select("id", { count: "exact", head: true }).in("workspace_id", workspaceIds))
      : Promise.resolve(0),
    headCount(supabase.from("marketing_campaigns").select("id", { count: "exact", head: true }).eq("business_id", businessId).eq("status", "active")),
    headCount(supabase.from("marketing_content").select("id", { count: "exact", head: true }).eq("business_id", businessId).eq("status", "published")),
    // Null, not 0, for a member without funding.view: RLS hides the rows, which is not the
    // same fact as "no investors".
    headCount(supabase.from("investors").select("id", { count: "exact", head: true }).eq("business_id", businessId).eq("status", "active")),
  ]);

  const now = new Date().toISOString();
  return {
    business: {
      id: businessId,
      name: business?.name ?? "",
      website: business?.website ?? null,
      description: business?.description ?? null,
      industry: business?.industry ?? null,
    },
    offerings: productRows.map((p) => {
      const icp = icpByWorkspace.get(workspaceByProduct.get(p.id as string) ?? "");
      return {
        id: p.id as string,
        name: p.name as string,
        description: (p.description as string) ?? null,
        valueProposition: (p.value_proposition as string) ?? null,
        primaryProblem: (p.primary_problem as string) ?? null,
        targetMarket: (p.target_market as string) ?? null,
        icp: icp
          ? { industries: arr(icp.industries), roles: arr(icp.roles), painPoints: arr(icp.pain_points), geographies: arr(icp.geographies) }
          : null,
      };
    }),
    counts: { prospects, activeCampaigns, publishedContent, investors },
    evidence: [
      { kind: "record", label: "Business profile", ref: businessId, observedAt: now },
      ...productRows.map((p) => ({ kind: "record" as const, label: `Offering: ${p.name as string}`, ref: p.id as string, observedAt: now })),
    ],
  };
});

/** Renders the context as plain lines for a prompt. Offering and ICP text was typed by
 * the founder or drafted earlier, so callers fence this with `untrusted()`. */
export function describeContext(ctx: DiscoveryContext): string {
  const lines = [
    `Business: ${ctx.business.name}${ctx.business.industry ? ` (${ctx.business.industry})` : ""}`,
    ctx.business.description ? `About: ${ctx.business.description}` : null,
    ctx.business.website ? `Website: ${ctx.business.website}` : null,
  ];
  for (const o of ctx.offerings) {
    lines.push(`Offering: ${o.name}`);
    if (o.description) lines.push(`  Description: ${o.description}`);
    if (o.valueProposition) lines.push(`  Value proposition: ${o.valueProposition}`);
    if (o.primaryProblem) lines.push(`  Problem solved: ${o.primaryProblem}`);
    if (o.targetMarket) lines.push(`  Target market: ${o.targetMarket}`);
    if (o.icp) {
      if (o.icp.industries.length) lines.push(`  ICP industries: ${o.icp.industries.join(", ")}`);
      if (o.icp.roles.length) lines.push(`  ICP roles: ${o.icp.roles.join(", ")}`);
      if (o.icp.painPoints.length) lines.push(`  ICP pain points: ${o.icp.painPoints.join("; ")}`);
      if (o.icp.geographies.length) lines.push(`  ICP geographies: ${o.icp.geographies.join(", ")}`);
    }
  }
  return lines.filter(Boolean).join("\n");
}
