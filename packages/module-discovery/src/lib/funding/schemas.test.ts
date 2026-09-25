/** FND-01. What the Funding forms cannot be trusted to have enforced. */
import { describe, expect, it } from "vitest";
import {
  investorInputSchema,
  profileInputSchema,
  researchInputSchema,
  roundInputSchema,
  shareInputSchema,
} from "./schemas";

describe("roundInputSchema", () => {
  it("requires a currency whenever an amount is entered", () => {
    expect(roundInputSchema.safeParse({ name: "Seed", roundType: "seed", targetAmount: "1,00,00,000" }).success).toBe(false);
    const ok = roundInputSchema.parse({ name: "Seed", roundType: "seed", targetAmount: "1,00,00,000", currency: "inr" });
    expect(ok.targetAmount).toBe(10_000_000);
    expect(ok.currency).toBe("INR");
  });

  it("refuses a minimum above the maximum and negative amounts", () => {
    expect(roundInputSchema.safeParse({ name: "S", roundType: "seed", minimumAmount: 10, maximumAmount: 5, currency: "INR" }).success).toBe(false);
    expect(roundInputSchema.safeParse({ name: "S", roundType: "seed", targetAmount: -1, currency: "INR" }).success).toBe(false);
  });
});

describe("investorInputSchema", () => {
  it("splits list fields and validates the email", () => {
    const v = investorInputSchema.parse({ name: "Acme Ventures", investorType: "vc", sectors: "SaaS\n\nSecurity", email: "Team@Acme.VC" });
    expect(v.sectors).toEqual(["SaaS", "Security"]);
    expect(v.email).toBe("team@acme.vc");
    expect(investorInputSchema.safeParse({ name: "A", investorType: "vc", email: "not-an-email" }).success).toBe(false);
  });
});

describe("researchInputSchema", () => {
  it("will not call a finding source-backed without its source", () => {
    expect(researchInputSchema.safeParse({ field: "thesis", content: "B2B SaaS", provenance: "source_backed" }).success).toBe(false);
    expect(
      researchInputSchema.safeParse({ field: "thesis", content: "B2B SaaS", provenance: "source_backed", sourceUrl: "https://acme.vc/thesis" }).success,
    ).toBe(true);
  });
});

describe("shareInputSchema", () => {
  it("needs a recipient and caps the expiry", () => {
    expect(shareInputSchema.safeParse({}).success).toBe(false);
    expect(shareInputSchema.parse({ recipientEmail: "a@b.co" }).days).toBe(14);
    expect(shareInputSchema.safeParse({ recipientEmail: "a@b.co", days: 365 }).success).toBe(false);
  });
});

describe("profileInputSchema", () => {
  it("requires a source on every traction figure", () => {
    expect(profileInputSchema.safeParse({ traction: [{ metric: "Customers", value: "40", source: "" }] }).success).toBe(false);
    expect(profileInputSchema.parse({ traction: [{ metric: "Customers", value: "40", source: "CRM export" }] }).traction[0]!.provenance).toBe(
      "user_entered",
    );
  });
});
