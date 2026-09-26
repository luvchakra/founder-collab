import type { Contact } from "../contacts/types";
import type { ContactVerification } from "../data-providers/contracts";
import type { Contactability } from "./types";

export type ContactabilityResult = { level: Contactability; reason: string };

/**
 * DISC-OFFER-P0-06.3: "contactability" -- a plain count of which real contact channels
 * (email, LinkedIn, phone) are on file for this contact, no AI call and nothing to
 * invent: a channel is either recorded or it isn't.
 */
export function deriveContactability(
  contact: Pick<Contact, "email" | "phone" | "linkedin_url">,
  /** DISC-OFFER-P1-03.3: the configured data provider's check of the email, when one was
   * made. An undeliverable address is not a channel; a risky one still is, with a note. */
  emailVerification?: ContactVerification | null,
): ContactabilityResult {
  const channels: string[] = [];
  const emailUnusable = emailVerification?.status === "undeliverable";
  if (contact.email && !emailUnusable) channels.push("email");
  if (contact.linkedin_url) channels.push("LinkedIn");
  if (contact.phone) channels.push("phone");

  const note = contact.email && emailVerification && emailVerification.status !== "unverified" && emailVerification.status !== "deliverable"
    ? ` (email: ${emailVerification.reason.replace(/\.$/, "").toLowerCase()})`
    : "";
  if (channels.length >= 2) return { level: "high", reason: `Reachable via ${channels.join(" and ")}${note}` };
  if (channels.length === 1) return { level: "medium", reason: `Reachable via ${channels[0]} only${note}` };
  return { level: "low", reason: emailUnusable ? `No usable channel${note}` : "No email, phone, or LinkedIn on file" };
}
