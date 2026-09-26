import { createHash } from "node:crypto";
import type { DataProviderAdapter } from "./contracts";
import { detectTechnologiesInText, verifyContactOffline } from "./builtin";

/**
 * DISC-OFFER-P1-03.3: a deterministic stand-in for an external data provider, for
 * development and tests -- every capability answers, with no network call, and the same
 * input always gives the same output. Everything it returns is made up and is marked
 * `sandbox: true` by the registry (and "[Sandbox]" in text), so it can never pass for a
 * real enrichment. Selected only by `DISCOVERY_DATA_PROVIDER=sandbox`.
 */

function pick<T>(seed: string, options: readonly T[]): T {
  const n = createHash("sha256").update(seed).digest().readUInt32BE(0);
  return options[n % options.length]!;
}

const INDUSTRIES = ["Financial services", "Healthcare", "Manufacturing", "Retail", "Software", "Logistics"] as const;
const EMPLOYEE_RANGES = ["11-50", "51-200", "201-500", "501-1000", "1001-5000"] as const;
const LOCATIONS = ["Bengaluru, India", "London, UK", "Singapore", "Austin, US", "Berlin, Germany"] as const;
const TITLES = ["Head of IT", "CISO", "VP Engineering", "IT Manager", "CFO"] as const;

function domainFor(companyName: string, domain?: string | null): string {
  return domain?.trim().toLowerCase() || `${companyName.toLowerCase().replace(/[^a-z0-9]+/g, "")}.example`;
}

export const sandboxDataProvider: DataProviderAdapter = {
  key: "sandbox",
  label: "Sandbox (made-up data)",
  sandbox: true,
  capabilities: {
    company_enrichment: async ({ companyName, domain }) => ({
      name: companyName,
      domain: domainFor(companyName, domain),
      industry: pick(`industry:${companyName}`, INDUSTRIES),
      employeeRange: pick(`size:${companyName}`, EMPLOYEE_RANGES),
      location: pick(`location:${companyName}`, LOCATIONS),
      description: `[Sandbox] Generated profile for ${companyName}, not real data.`,
    }),
    person_enrichment: async ({ fullName, email, linkedinUrl }) => ({
      fullName: fullName ?? null,
      title: pick(`title:${fullName ?? email ?? ""}`, TITLES),
      email: email ?? null,
      linkedinUrl: linkedinUrl ?? null,
    }),
    signals: async ({ companyName }) => [
      { type: "buying_signal", description: `[Sandbox] ${companyName} is hiring for ${pick(`hire:${companyName}`, TITLES)}`, observedAt: null, sourceUrl: null },
      { type: "recent_event", description: `[Sandbox] ${companyName} announced an expansion`, observedAt: null, sourceUrl: null },
    ],
    technology_detection: async (input) => detectTechnologiesInText(input),
    contact_verification: async (input) => {
      const offline = verifyContactOffline(input);
      if (offline.status !== "unverified") return offline;
      return pick(`deliverable:${input.email.toLowerCase()}`, [
        { status: "deliverable" as const, reason: "[Sandbox] Mailbox accepted the address." },
        { status: "undeliverable" as const, reason: "[Sandbox] Mailbox does not exist." },
      ]);
    },
  },
};
