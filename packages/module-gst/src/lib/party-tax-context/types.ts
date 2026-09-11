/**
 * COMPLY-P0-03.4 (Party Tax Context): "Use Core party address/tax-registration data."
 * See `queries.ts`'s own docstring for why this reads `core.tax_identities`/
 * `core.addresses` directly rather than any `gst`-schema copy.
 */

export type PartyAddressKind = "billing" | "shipping" | "service";

/** One `core.addresses` row, camelCase. */
export type PartyAddress = {
  id: string;
  kind: PartyAddressKind;
  isPrimary: boolean;
  formatted: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  country: string | null;
};

export type GstRegistrationType = "regular" | "composition" | "unregistered";

/** One `core.tax_identities` row, camelCase -- a party's OWN GSTIN/state/registration
 * type (as opposed to `gst.tax_registrations`, which is the FILING BUSINESS's own
 * registrations -- see `queries.ts` for the full distinction). */
export type PartyTaxIdentity = {
  partyId: string;
  gstin: string | null;
  state: string | null;
  gstRegistrationType: GstRegistrationType;
};

/** The combined read COMPLY-P0-04.4 (Place of Supply) and COMPLY-P0-04.5 (GST Tax
 * Determination) will need: a party's tax identity plus its primary billing and
 * shipping addresses. `taxIdentity`/`billingAddress`/`shippingAddress` are each `null`
 * when no such `core` row exists for this party -- absence of data, never a claim about
 * the party's actual tax status (e.g. `taxIdentity: null` must NOT be read as
 * "unregistered"; it means the platform simply has no GSTIN on file for this party yet). */
export type PartyTaxContext = {
  partyId: string;
  taxIdentity: PartyTaxIdentity | null;
  billingAddress: PartyAddress | null;
  shippingAddress: PartyAddress | null;
};
