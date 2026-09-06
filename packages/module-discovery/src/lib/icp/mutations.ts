import { createClient } from "../../db/server";
import type { IcpProfile } from "./types";

/** Any manual edit resets status to draft -- it must be explicitly re-approved. */
export async function updateIcpProfile(
  icpId: string,
  input: {
    name: string;
    description: string;
    industries: string[];
    companySizes: string[];
    geographies: string[];
    roles: string[];
    painPoints: string[];
    buyingSignals: string[];
    exclusions: string[];
  },
): Promise<IcpProfile> {
  const name = input.name.trim();
  if (!name) throw new Error("Name is required.");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("icp_profiles")
    .update({
      name,
      description: input.description.trim() || null,
      industries: input.industries,
      company_sizes: input.companySizes,
      geographies: input.geographies,
      roles: input.roles,
      pain_points: input.painPoints,
      buying_signals: input.buyingSignals,
      exclusions: input.exclusions,
      status: "draft",
    })
    .eq("id", icpId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function approveIcpProfile(icpId: string): Promise<IcpProfile> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("icp_profiles")
    .update({ status: "approved" })
    .eq("id", icpId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

/** Parses one list-field textarea (one item per line) into a clean string array. */
export function parseListField(raw: string): string[] {
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}
