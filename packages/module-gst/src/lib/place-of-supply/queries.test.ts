import { describe, expect, it } from "vitest";
import { chooseBuyerAddress } from "./queries";
import type { PartyAddress, PartyTaxContext } from "../party-tax-context/types";

const address = (kind: PartyAddress["kind"], state: string): PartyAddress => ({
  id: `${kind}-id`,
  kind,
  isPrimary: true,
  formatted: null,
  city: null,
  state,
  postalCode: null,
  country: null,
});

const baseContext: PartyTaxContext = {
  partyId: "party-1",
  taxIdentity: null,
  billingAddress: null,
  shippingAddress: null,
};

describe("chooseBuyerAddress", () => {
  it("prefers the shipping address when both are present", () => {
    const context = { ...baseContext, shippingAddress: address("shipping", "Karnataka"), billingAddress: address("billing", "Maharashtra") };
    expect(chooseBuyerAddress(context)).toEqual(address("shipping", "Karnataka"));
  });

  it("falls back to the billing address when there's no shipping address", () => {
    const context = { ...baseContext, billingAddress: address("billing", "Maharashtra") };
    expect(chooseBuyerAddress(context)).toEqual(address("billing", "Maharashtra"));
  });

  it("returns null when the party has neither address", () => {
    expect(chooseBuyerAddress(baseContext)).toBeNull();
  });
});
