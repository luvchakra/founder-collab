import { describe, expect, it } from "vitest";
import { detectTechnologiesInText, verifyContactOffline } from "./builtin";
import { DataProviderError, type DataProviderAdapter } from "./contracts";
import { resolveDataProvider, runDataCapability, supportsCapability } from "./registry";
import { sandboxDataProvider } from "./sandbox";
import { researchEvidenceText } from "./prospect-data";
import { deriveContactability } from "../buyer-intelligence/contactability";

// DISC-OFFER-P1-03.3 "Provider-Agnostic Data Contracts"

describe("verifyContactOffline", () => {
  it("never claims deliverable, and explains every other verdict", () => {
    expect(verifyContactOffline({ email: "not-an-email" })).toEqual({ status: "undeliverable", reason: "Not a valid email address." });
    expect(verifyContactOffline({ email: "sales@acme.com", companyDomain: "acme.com" }).status).toBe("risky");
    expect(verifyContactOffline({ email: "priya@gmail.com", companyDomain: "acme.com" })).toMatchObject({ status: "risky", reason: expect.stringMatching(/Personal mailbox/) });
    expect(verifyContactOffline({ email: "priya@globex.com", companyDomain: "https://www.acme.com/about" })).toMatchObject({
      status: "risky",
      reason: expect.stringContaining("acme.com"),
    });
    expect(verifyContactOffline({ email: "Priya@EU.Acme.com", companyDomain: "acme.com" }).status).toBe("unverified");
    expect(verifyContactOffline({ email: "priya@acme.com" })).toEqual({ status: "unverified", reason: "Well-formed address; delivery not tested." });
  });
});

describe("detectTechnologiesInText", () => {
  it("finds named technologies as whole words and cites the sentence each came from", () => {
    const found = detectTechnologiesInText({
      companyName: "Acme",
      evidenceText: ["Acme runs its workforce on Okta and Azure AD. Revenue grew 40%.", "They migrated to AWS last year."],
    });
    expect(found.map((t) => t.name)).toEqual(["AWS", "Okta", "Microsoft Entra ID"]);
    expect(found.find((t) => t.name === "Okta")?.evidence).toBe("Acme runs its workforce on Okta and Azure AD.");
  });

  it("does not match inside other words, or anything without text to rest on", () => {
    expect(detectTechnologiesInText({ companyName: "Acme", evidenceText: ["Their slackline team and sapient design studio."] })).toEqual([]);
    expect(detectTechnologiesInText({ companyName: "Acme" })).toEqual([]);
  });
});

describe("runDataCapability", () => {
  const fake = (capabilities: DataProviderAdapter["capabilities"]): DataProviderAdapter => ({ key: "fake", label: "Fake provider", sandbox: false, capabilities });

  it("reports a capability the adapter lacks as not_supported, a normal result", async () => {
    const builtin = resolveDataProvider({});
    expect(supportsCapability("company_enrichment", builtin)).toBe(false);
    expect(await runDataCapability("company_enrichment", { companyName: "Acme" }, builtin)).toMatchObject({ ok: false, code: "not_supported", provider: "builtin" });
  });

  it("returns the normalized shape and names the provider", async () => {
    expect(await runDataCapability("contact_verification", { email: "priya@acme.com", companyDomain: "acme.com" }, resolveDataProvider({}))).toEqual({
      ok: true,
      data: { status: "unverified", reason: "Well-formed address on the company's domain; delivery not tested." },
      provider: "builtin",
      sandbox: false,
    });
  });

  it("never lets a provider's own fields or bad values through", async () => {
    const leaky = fake({
      company_enrichment: async () => ({ name: "Acme", domain: null, industry: null, employeeRange: null, location: null, description: null, vendorScore: 97 }) as never,
    });
    const ok = await runDataCapability("company_enrichment", { companyName: "Acme" }, leaky);
    expect(ok.ok && Object.keys(ok.data)).not.toContain("vendorScore");

    const broken = fake({ contact_verification: async () => ({ status: "valid-ish", reason: "" }) as never });
    expect(await runDataCapability("contact_verification", { email: "a@b.co" }, broken)).toMatchObject({ ok: false, code: "invalid_response" });
  });

  it("normalizes adapter failures", async () => {
    const limited = fake({ signals: async () => { throw new DataProviderError("rate_limited", "Slow down"); } });
    expect(await runDataCapability("signals", { companyName: "Acme" }, limited)).toMatchObject({ ok: false, code: "rate_limited", message: "Slow down" });
    const down = fake({ signals: async () => { throw new Error("ECONNRESET https://api.vendor.example/v2"); } });
    const result = await runDataCapability("signals", { companyName: "Acme" }, down);
    expect(result).toMatchObject({ ok: false, code: "provider_unavailable" });
    expect(!result.ok && result.message).not.toContain("vendor");
  });
});

describe("sandbox provider", () => {
  it("is selected only explicitly, answers every capability deterministically, and is labelled", async () => {
    expect(resolveDataProvider({}).key).toBe("builtin");
    expect(resolveDataProvider({ DISCOVERY_DATA_PROVIDER: "unknown-vendor" }).key).toBe("builtin");
    expect(resolveDataProvider({ DISCOVERY_DATA_PROVIDER: " Sandbox " })).toBe(sandboxDataProvider);

    const first = await runDataCapability("company_enrichment", { companyName: "Acme Corp" }, sandboxDataProvider);
    const again = await runDataCapability("company_enrichment", { companyName: "Acme Corp" }, sandboxDataProvider);
    expect(first).toEqual(again);
    expect(first).toMatchObject({ ok: true, sandbox: true, data: { domain: "acmecorp.example", description: expect.stringContaining("[Sandbox]") } });

    for (const capability of ["person_enrichment", "signals", "technology_detection", "contact_verification"] as const) {
      const input = capability === "contact_verification" ? { email: "priya@acme.com" } : { companyName: "Acme", fullName: "Priya" };
      expect((await runDataCapability(capability, input as never, sandboxDataProvider)).ok).toBe(true);
    }
  });
});

describe("contact verification in contactability", () => {
  it("drops an undeliverable email as a channel and notes a risky one", () => {
    const contact = { email: "sales@acme.com", phone: null, linkedin_url: "https://linkedin.com/in/x" };
    expect(deriveContactability(contact, { status: "undeliverable", reason: "Mailbox does not exist." })).toEqual({
      level: "medium",
      reason: "Reachable via LinkedIn only (email: mailbox does not exist)",
    });
    expect(deriveContactability(contact, { status: "risky", reason: "Shared mailbox, not a person's own address." }).reason).toBe(
      "Reachable via email and LinkedIn (email: shared mailbox, not a person's own address)",
    );
    expect(deriveContactability(contact).level).toBe("high");
  });
});

describe("researchEvidenceText", () => {
  it("collects every research field a detection may cite", () => {
    expect(
      researchEvidenceText({
        summary: "Runs on SAP.",
        pain_points: ["Manual onboarding"],
        buying_signals: [],
        recent_events: ["Moved to AWS"],
        evidence: [{ statement: "Uses Okta", source: null, source_url: null, observed_at: null, supporting_signal: null, evidence_type: "fact", confidence: "high" }],
      }),
    ).toEqual(["Runs on SAP.", "Manual onboarding", "Moved to AWS", "Uses Okta"]);
  });
});
