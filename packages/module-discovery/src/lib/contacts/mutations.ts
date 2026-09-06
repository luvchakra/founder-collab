import { createClient } from "../../db/server";
import type { Contact } from "./types";

export async function createContact(
  workspaceId: string,
  prospectId: string,
  input: {
    firstName?: string;
    lastName?: string;
    jobTitle?: string;
    email?: string;
    linkedinUrl?: string;
    phone?: string;
  },
): Promise<Contact> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("contacts")
    .insert({
      workspace_id: workspaceId,
      prospect_id: prospectId,
      first_name: input.firstName?.trim() || null,
      last_name: input.lastName?.trim() || null,
      job_title: input.jobTitle?.trim() || null,
      email: input.email?.trim() || null,
      linkedin_url: input.linkedinUrl?.trim() || null,
      phone: input.phone?.trim() || null,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateContact(
  contactId: string,
  input: {
    firstName?: string;
    lastName?: string;
    jobTitle?: string;
    email?: string;
    linkedinUrl?: string;
    phone?: string;
  },
): Promise<Contact> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("contacts")
    .update({
      first_name: input.firstName?.trim() || null,
      last_name: input.lastName?.trim() || null,
      job_title: input.jobTitle?.trim() || null,
      email: input.email?.trim() || null,
      linkedin_url: input.linkedinUrl?.trim() || null,
      phone: input.phone?.trim() || null,
    })
    .eq("id", contactId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteContact(contactId: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from("contacts").delete().eq("id", contactId);
  if (error) throw error;
}
