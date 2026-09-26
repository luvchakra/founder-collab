import type { Contact } from "../contacts/types";
import type { Contactability } from "./types";

export type ContactabilityResult = { level: Contactability; reason: string };

/**
 * DISC-OFFER-P0-06.3: "contactability" -- a plain count of which real contact channels
 * (email, LinkedIn, phone) are on file for this contact, no AI call and nothing to
 * invent: a channel is either recorded or it isn't.
 */
export function deriveContactability(contact: Pick<Contact, "email" | "phone" | "linkedin_url">): ContactabilityResult {
  const channels: string[] = [];
  if (contact.email) channels.push("email");
  if (contact.linkedin_url) channels.push("LinkedIn");
  if (contact.phone) channels.push("phone");

  if (channels.length >= 2) return { level: "high", reason: `Reachable via ${channels.join(" and ")}` };
  if (channels.length === 1) return { level: "medium", reason: `Reachable via ${channels[0]} only` };
  return { level: "low", reason: "No email, phone, or LinkedIn on file" };
}
