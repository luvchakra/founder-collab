import { z } from "zod";

/**
 * DISC-OFFER-P1-03.3 "Provider-Agnostic Data Contracts": the five external-data
 * capabilities the backlog names -- company enrichment, person enrichment, signals,
 * technology detection, contact verification -- as normalized inputs, normalized outputs
 * and one adapter interface. Discovery's domain code and UI depend only on these types
 * and on `registry.ts`; which provider serves a capability, and whatever shape that
 * provider's own API returns, stays inside its adapter. An adapter's output is validated
 * against the schemas below before any caller sees it, so a provider cannot leak a field
 * (or a malformed value) past this boundary.
 *
 * AI research (`lib/ai/research-prospect.ts`, routed through the BYOK AI Router) remains
 * how Discovery enriches companies and finds signals today; an external enrichment or
 * signal provider plugs in here as an adapter when one is licensed, with no change to
 * its callers.
 */

export const DATA_CAPABILITIES = [
  "company_enrichment",
  "person_enrichment",
  "signals",
  "technology_detection",
  "contact_verification",
] as const;
export type DataCapability = (typeof DATA_CAPABILITIES)[number];

export const DATA_CAPABILITY_LABEL: Record<DataCapability, string> = {
  company_enrichment: "Company enrichment",
  person_enrichment: "Person enrichment",
  signals: "Signals",
  technology_detection: "Technology detection",
  contact_verification: "Contact verification",
};

// ---------------------------------------------------------------------------
// Inputs -- what Discovery already knows about the company or person.
// ---------------------------------------------------------------------------

export type CompanyLookup = { companyName: string; domain?: string | null };
export type PersonLookup = { fullName?: string | null; email?: string | null; companyDomain?: string | null; linkedinUrl?: string | null };
export type SignalsLookup = CompanyLookup & { since?: string | null };
/** `evidenceText`: text the platform already holds about the company (research summary,
 * evidence statements) -- a provider may use it, ignore it, or look the domain up itself. */
export type TechnologyLookup = CompanyLookup & { evidenceText?: string[] };
export type ContactVerificationInput = { email: string; companyDomain?: string | null };

export type DataCapabilityInput = {
  company_enrichment: CompanyLookup;
  person_enrichment: PersonLookup;
  signals: SignalsLookup;
  technology_detection: TechnologyLookup;
  contact_verification: ContactVerificationInput;
};

// ---------------------------------------------------------------------------
// Outputs -- one normalized shape per capability, whoever produced it.
// ---------------------------------------------------------------------------

export const companyProfileSchema = z.object({
  name: z.string().min(1),
  domain: z.string().nullable(),
  industry: z.string().nullable(),
  employeeRange: z.string().nullable(),
  location: z.string().nullable(),
  description: z.string().nullable(),
});
export type CompanyProfile = z.infer<typeof companyProfileSchema>;

export const personProfileSchema = z.object({
  fullName: z.string().nullable(),
  title: z.string().nullable(),
  email: z.string().nullable(),
  linkedinUrl: z.string().nullable(),
});
export type PersonProfile = z.infer<typeof personProfileSchema>;

export const detectedSignalSchema = z.object({
  /** The same two kinds `discovery.signals.signal_type` stores. */
  type: z.enum(["buying_signal", "recent_event"]),
  description: z.string().min(1),
  observedAt: z.string().nullable(),
  sourceUrl: z.string().nullable(),
});
export const detectedSignalsSchema = z.array(detectedSignalSchema);
export type DetectedSignal = z.infer<typeof detectedSignalSchema>;

export const detectedTechnologySchema = z.object({
  name: z.string().min(1),
  category: z.string().nullable(),
  /** The text the detection rests on -- never a detection without one. */
  evidence: z.string().min(1),
});
export const detectedTechnologiesSchema = z.array(detectedTechnologySchema);
export type DetectedTechnology = z.infer<typeof detectedTechnologySchema>;

/**
 * `deliverable`/`undeliverable` are claims about the mailbox and need a provider that
 * actually checks it; `risky` means it may reach a shared or personal inbox rather than
 * the person; `unverified` means nothing is wrong with it but delivery was not tested.
 */
export const CONTACT_VERIFICATION_STATUSES = ["deliverable", "undeliverable", "risky", "unverified"] as const;
export const contactVerificationSchema = z.object({
  status: z.enum(CONTACT_VERIFICATION_STATUSES),
  reason: z.string().min(1),
});
export type ContactVerification = z.infer<typeof contactVerificationSchema>;

export type DataCapabilityOutput = {
  company_enrichment: CompanyProfile;
  person_enrichment: PersonProfile;
  signals: DetectedSignal[];
  technology_detection: DetectedTechnology[];
  contact_verification: ContactVerification;
};

export const DATA_CAPABILITY_SCHEMA: { [C in DataCapability]: z.ZodType<DataCapabilityOutput[C]> } = {
  company_enrichment: companyProfileSchema,
  person_enrichment: personProfileSchema,
  signals: detectedSignalsSchema,
  technology_detection: detectedTechnologiesSchema,
  contact_verification: contactVerificationSchema,
};

// ---------------------------------------------------------------------------
// Adapter + result
// ---------------------------------------------------------------------------

/** Provider-shape-free failure codes, the same idea as the AI Router's `AiErrorCode`. */
export type DataProviderErrorCode = "not_supported" | "not_found" | "rate_limited" | "provider_unavailable" | "invalid_response";

/** Thrown by an adapter to report a failure in the normalized vocabulary. Anything else
 * an adapter throws is reported as `provider_unavailable`. */
export class DataProviderError extends Error {
  readonly code: DataProviderErrorCode;
  constructor(code: DataProviderErrorCode, message: string) {
    super(message);
    this.name = "DataProviderError";
    this.code = code;
  }
}

export type DataProviderResult<T> =
  | { ok: true; data: T; provider: string; sandbox: boolean }
  | { ok: false; code: DataProviderErrorCode; message: string; provider: string };

/**
 * One provider's implementation of any subset of the capabilities. A capability it does
 * not implement is reported as `not_supported` -- a normal result callers handle, the
 * same way a cross-module call handles `MODULE_NOT_LICENSED`.
 */
export type DataProviderAdapter = {
  key: string;
  label: string;
  /** True for the deterministic sandbox: its data is made up and must be labelled so. */
  sandbox: boolean;
  capabilities: { [C in DataCapability]?: (input: DataCapabilityInput[C]) => Promise<DataCapabilityOutput[C]> };
};
