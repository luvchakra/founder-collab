import { describe, expect, it } from "vitest";
import { mapPartyAddress, mapPartyTaxIdentity, selectPartyAddress } from "./queries";
import type { PartyAddress } from "./types";

describe("party tax identity mapping", () => {
  it("translates a core.tax_identities row to camelCase fields", () => {
    const identity = mapPartyTaxIdentity({
      party_id: "party-1",
      gstin: "27ABCDE1234F1Z5",
      state: "Maharashtra",
      gst_registration_type: "regular",
    });
    expect(identity).toEqual({
      partyId: "party-1",
      gstin: "27ABCDE1234F1Z5",
      state: "Maharashtra",
      gstRegistrationType: "regular",
    });
  });

  it("passes through every gst_registration_type the platform's own check constraint allows", () => {
    for (const type of ["regular", "composition", "unregistered"]) {
      const identity = mapPartyTaxIdentity({
        party_id: "party-x",
        gstin: null,
        state: null,
        gst_registration_type: type,
      });
      expect(identity.gstRegistrationType).toBe(type);
    }
  });

  it("passes through a null gstin/state (a party recorded without a GSTIN on file)", () => {
    const identity = mapPartyTaxIdentity({
      party_id: "party-2",
      gstin: null,
      state: null,
      gst_registration_type: "unregistered",
    });
    expect(identity.gstin).toBeNull();
    expect(identity.state).toBeNull();
  });
});

describe("party address mapping", () => {
  it("translates a core.addresses row to camelCase fields", () => {
    const address = mapPartyAddress({
      id: "addr-1",
      kind: "billing",
      is_primary: true,
      formatted: "221B Baker Street",
      city: "Mumbai",
      state: "Maharashtra",
      postal_code: "400001",
      country: "IN",
    });
    expect(address).toEqual({
      id: "addr-1",
      kind: "billing",
      isPrimary: true,
      formatted: "221B Baker Street",
      city: "Mumbai",
      state: "Maharashtra",
      postalCode: "400001",
      country: "IN",
    });
  });

  it("preserves every address kind the platform's own check constraint allows", () => {
    for (const kind of ["billing", "shipping", "service"]) {
      const address = mapPartyAddress({
        id: "addr-x",
        kind,
        is_primary: false,
        formatted: null,
        city: null,
        state: null,
        postal_code: null,
        country: null,
      });
      expect(address.kind).toBe(kind);
    }
  });
});

describe("selectPartyAddress", () => {
  const billing1: PartyAddress = {
    id: "b1",
    kind: "billing",
    isPrimary: false,
    formatted: "Billing 1",
    city: null,
    state: "Maharashtra",
    postalCode: null,
    country: "IN",
  };
  const billing2Primary: PartyAddress = {
    id: "b2",
    kind: "billing",
    isPrimary: true,
    formatted: "Billing 2 (primary)",
    city: null,
    state: "Karnataka",
    postalCode: null,
    country: "IN",
  };
  const shipping1: PartyAddress = {
    id: "s1",
    kind: "shipping",
    isPrimary: false,
    formatted: "Shipping 1",
    city: null,
    state: "Delhi",
    postalCode: null,
    country: "IN",
  };

  it("picks the primary address of the requested kind when one is marked", () => {
    const result = selectPartyAddress([billing1, billing2Primary, shipping1], "billing");
    expect(result?.id).toBe("b2");
  });

  it("falls back to the first address of that kind when none is marked primary", () => {
    const result = selectPartyAddress([billing1, shipping1], "billing");
    expect(result?.id).toBe("b1");
  });

  it("returns null when the party has no address of that kind", () => {
    const result = selectPartyAddress([billing1, billing2Primary], "shipping");
    expect(result).toBeNull();
  });

  it("returns null for an empty address list", () => {
    expect(selectPartyAddress([], "billing")).toBeNull();
  });
});
