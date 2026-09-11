import { requireModule } from "@cofounderai/core/licensing/queries";
import { createClient } from "../../db/server";

export type WhatsAppTemplate = {
  id: string;
  business_id: string;
  name: string;
  language_code: string;
  variable_count: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

/**
 * CRM-07.8's local template catalog -- a record of templates already approved on Meta's
 * side (submitting/approving new ones with Meta is a separate, real feature this story
 * doesn't build), kept here purely so a human can pick one and know how many `{{n}}`
 * variables to fill in before `sendWhatsAppTemplate()` calls the real Graph API.
 */
export async function listWhatsAppTemplates(businessId: string, options?: { activeOnly?: boolean }): Promise<WhatsAppTemplate[]> {
  const supabase = await createClient();
  let query = supabase.from("whatsapp_template").select("*").eq("business_id", businessId);
  if (options?.activeOnly) query = query.eq("is_active", true);
  const { data, error } = await query.order("name", { ascending: true });
  if (error) throw error;
  return data as WhatsAppTemplate[];
}

export async function getWhatsAppTemplate(businessId: string, templateId: string): Promise<WhatsAppTemplate | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("whatsapp_template").select("*").eq("business_id", businessId).eq("id", templateId).maybeSingle();
  if (error) throw error;
  return data as WhatsAppTemplate | null;
}

export async function createWhatsAppTemplate(businessId: string, input: { name: string; languageCode: string; variableCount: number }): Promise<WhatsAppTemplate> {
  await requireModule(businessId, "crm");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("whatsapp_template")
    .insert({ business_id: businessId, name: input.name, language_code: input.languageCode, variable_count: input.variableCount })
    .select("*")
    .single();
  if (error) throw error;
  return data as WhatsAppTemplate;
}

/** Soft-remove only -- a template that was already used in past sends stays referenced
 * from those interactions' `metadata.templateId`; deleting the row outright would orphan
 * that history for no benefit, so this just stops it from being offered for new sends. */
export async function deactivateWhatsAppTemplate(businessId: string, templateId: string): Promise<void> {
  await requireModule(businessId, "crm");
  const supabase = await createClient();
  const { error } = await supabase.from("whatsapp_template").update({ is_active: false }).eq("business_id", businessId).eq("id", templateId);
  if (error) throw error;
}
