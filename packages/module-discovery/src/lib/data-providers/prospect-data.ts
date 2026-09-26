import type { Contact } from "../contacts/types";
import type { ProspectResearch } from "../research/types";
import type { ContactVerification, DetectedTechnology } from "./contracts";
import { runDataCapability } from "./registry";

/**
 * DISC-OFFER-P1-03.3: Discovery's own uses of the data-provider contract. Each goes
 * through `runDataCapability`, so what comes back is the normalized shape whichever
 * adapter is configured; an unsupported or failed capability is simply "nothing to show".
 */

/** The research text a technology detection may rest on. */
export function researchEvidenceText(research: Pick<ProspectResearch, "summary" | "pain_points" | "buying_signals" | "recent_events" | "evidence">): string[] {
  return [
    research.summary ?? "",
    ...research.pain_points,
    ...research.buying_signals,
    ...research.recent_events,
    ...research.evidence.map((e) => e.statement),
  ].filter((t) => t.trim() !== "");
}

export type ProspectTechnologies = { technologies: DetectedTechnology[]; sandbox: boolean };

export async function detectProspectTechnologies(
  prospect: { company_name: string; domain: string | null },
  research: Pick<ProspectResearch, "summary" | "pain_points" | "buying_signals" | "recent_events" | "evidence"> | null,
): Promise<ProspectTechnologies | null> {
  const result = await runDataCapability("technology_detection", {
    companyName: prospect.company_name,
    domain: prospect.domain,
    evidenceText: research ? researchEvidenceText(research) : [],
  });
  return result.ok ? { technologies: result.data, sandbox: result.sandbox } : null;
}

/** One verification per contact with an email, keyed by contact id. */
export async function verifyContactEmails(contacts: Pick<Contact, "id" | "email">[], companyDomain: string | null): Promise<Map<string, ContactVerification>> {
  const withEmail = contacts.filter((c): c is Pick<Contact, "id"> & { email: string } => Boolean(c.email?.trim()));
  const results = await Promise.all(
    withEmail.map(async (c) => [c.id, await runDataCapability("contact_verification", { email: c.email, companyDomain })] as const),
  );
  const map = new Map<string, ContactVerification>();
  for (const [id, result] of results) if (result.ok) map.set(id, result.data);
  return map;
}
