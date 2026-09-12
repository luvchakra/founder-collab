/**
 * COMPLY-P0-06.2 (Movement Data): "Consignor/consignee/transport/vehicle/distance/supply
 * details." See the `gst.eway_bill_movements` migration's own docstring for why this
 * table holds only the facts that have no other home (transport/vehicle/distance/supply
 * classification, plus consignor/consignee OVERRIDES) rather than a copy of the
 * consignor's registration (`gst.tax_registrations`) or the consignee's own party/address
 * data (`core.parties`/`core.tax_identities`/`core.addresses`).
 */

export type TransactionType =
  | "regular"
  | "bill_to_ship_to"
  | "bill_from_dispatch_from"
  | "combination_bill_to_ship_to_and_bill_from_dispatch_from";

/** See `catalog.ts`'s own docstring for sourcing -- this session's own research found
 * solid, multiply-corroborated wording only for the OUTWARD-movement vocabulary. */
export type SubSupplyType =
  | "supply"
  | "export"
  | "job_work"
  | "skd_ckd_lots"
  | "recipient_not_known"
  | "for_own_use"
  | "exhibition_or_fair"
  | "line_sales"
  | "others";

export type TransportMode = "road" | "rail" | "air" | "ship";

export type VehicleType = "regular" | "over_dimensional_cargo";

/** A dispatch-from (consignor) or ship-to (consignee) override -- filled in only when a
 * movement's real location genuinely differs from the consignor's registered address or
 * the consignee's own address on file. Every field is optional: a caller may know only
 * some of them, and this module never invents the rest. */
export type LocationOverride = {
  name?: string;
  gstin?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  pincode?: string;
};

/** `gst.eway_bill_movements` row shape, camelCase. */
export type EwayBillMovement = {
  id: string;
  businessId: string;
  documentId: string;
  transactionType: TransactionType;
  subSupplyType: SubSupplyType | null;
  transportMode: TransportMode | null;
  vehicleType: VehicleType;
  vehicleNumber: string | null;
  transporterId: string | null;
  transporterName: string | null;
  transporterDocNumber: string | null;
  transporterDocDate: string | null;
  distanceKm: number | null;
  dispatchFromOverride: LocationOverride | null;
  shipToOverride: LocationOverride | null;
  createdAt: string;
  updatedAt: string;
};

/** Input to `upsertEwayBillMovement` -- every field optional (a caller may be filling
 * this in incrementally, one fact at a time, long before generating an e-way bill).
 * `subSupplyType`/`transportMode` accept `null` explicitly to CLEAR a previously-set
 * value (as opposed to `undefined`, which leaves the existing stored value alone on an
 * update) -- same "explicit null clears, undefined leaves alone" convention
 * `setGstRegistrationProfile`'s own metadata merge already relies on for its own optional
 * fields. */
export type EwayBillMovementInput = {
  transactionType?: TransactionType;
  subSupplyType?: SubSupplyType | null;
  transportMode?: TransportMode | null;
  vehicleType?: VehicleType;
  vehicleNumber?: string | null;
  transporterId?: string | null;
  transporterName?: string | null;
  transporterDocNumber?: string | null;
  transporterDocDate?: string | null;
  distanceKm?: number | null;
  dispatchFromOverride?: LocationOverride | null;
  shipToOverride?: LocationOverride | null;
};

/** The filing business's own default consignor identity -- read live from its primary
 * India/GST registration (`gst.tax_registrations`) and business name, never stored on
 * this table. `null` fields mean "not set up yet", never a claim about the business's
 * actual registration status (backlog rule 11). */
export type ConsignorDetails = {
  businessName: string | null;
  gstin: string | null;
  state: string | null;
};
