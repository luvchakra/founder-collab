import { describe, expect, it } from "vitest";
import { profileToRow, validateOrganizationProfile } from "./platform-organization-profile-rules";

// PLATFORM-P1-10.12: organization details are cleaned and checked before saving.
describe("validateOrganizationProfile", () => {
  it("cleans values", () => {
    const r = validateOrganizationProfile({ contactEmail: " Ann@Acme.Example ", country: "in", industry: "  ", website: "https://acme.example" });
    expect(r).toEqual({
      ok: true,
      profile: expect.objectContaining({ contactEmail: "ann@acme.example", country: "IN", industry: null, website: "https://acme.example" }),
    });
  });

  it("refuses bad values with a message", () => {
    expect(validateOrganizationProfile({ contactEmail: "nope" })).toEqual({ ok: false, error: "Enter a valid contact email." });
    expect(validateOrganizationProfile({ companyPhone: "call me" })).toMatchObject({ ok: false });
    expect(validateOrganizationProfile({ country: "India" })).toMatchObject({ ok: false, error: expect.stringContaining("two-letter") });
    expect(validateOrganizationProfile({ userBaseSize: "lots" })).toMatchObject({ ok: false });
    expect(validateOrganizationProfile({ website: "acme.example" })).toMatchObject({ ok: false });
    expect(validateOrganizationProfile({ description: "x".repeat(1001) })).toMatchObject({ ok: false });
  });

  it("allows an empty profile", () => {
    expect(validateOrganizationProfile({})).toMatchObject({ ok: true });
  });

  it("maps to the database's columns", () => {
    const r = validateOrganizationProfile({ contactName: "Ann", userBaseSize: "51-200" });
    if (!r.ok) throw new Error("expected ok");
    expect(profileToRow(r.profile)).toMatchObject({ contact_name: "Ann", user_base_size: "51-200", website: null });
  });
});
