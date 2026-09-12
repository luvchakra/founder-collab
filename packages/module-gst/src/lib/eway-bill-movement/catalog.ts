import type { SubSupplyType, TransactionType, TransportMode, VehicleType } from "./types";

/**
 * COMPLY-P0-06.2 (Movement Data): the closed, application-level vocabularies for this
 * story's own classification fields. Same shape/placement as
 * `lib/compliance/treatments.ts`'s own `TAX_TREATMENT_CATALOG` -- a small, near-universal
 * set of named categories, not a rate or a jurisdiction, so it is safe to encode as a
 * fixed application-code catalog rather than a table (this does NOT conflict with "never
 * hard-code tax rates into UI components" -- nothing here is a rate).
 *
 * Sourced via web search (this session, 2026-09-12), not assumed from memory:
 * - `TRANSACTION_TYPE_CATALOG`'s 4 values are the NIC e-Way Bill portal's own named
 *   transaction-type categories, per Avalara's knowledge base and ClearTax's own
 *   generation guide: "Regular" (only bill-from/bill-to present), "Bill To - Ship To"
 *   (bill-from, bill-to, AND ship-to present), "Bill From - Dispatch From" (bill-from,
 *   dispatch-from, AND bill-to present), and their combination.
 * - `SUB_SUPPLY_TYPE_CATALOG`'s 9 values are the NIC portal's own OUTWARD-movement
 *   sub-supply-type list, per GSTRobo's own user manual and Tally Academy's e-way-bill
 *   FAQ (both independently describing the same nine named categories with matching
 *   definitions): Supply, Export, Job Work, SKD/CKD/Lots, Recipient Not Known, For Own
 *   Use, Exhibition or Fair, Line Sales, Others. The INWARD-movement vocabulary (e.g.
 *   Purchase, Sales Return) is deliberately NOT modeled here -- this session's research
 *   did not turn up equally solid, multiply-corroborated sourcing for it, and this
 *   backlog's own discipline is to verify a real regulatory/schema fact before writing it
 *   in, never to guess wording that "sounds right." Flagged as a documented, extensible
 *   gap: a future story can add an inward catalog once it has a real source to cite,
 *   without any schema change (`sub_supply_type` is unconstrained free text at the
 *   database level for exactly this reason).
 *
 * `TRANSPORT_MODE_CATALOG`/`VEHICLE_TYPE_CATALOG` are the NIC portal's own
 * well-established mode/vehicle-type fields (road/rail/air/ship; regular vs. Over
 * Dimensional Cargo per Rule 93 of the Central Motor Vehicle Rules, 1989, the same ODC
 * definition COMPLY-P0-06.2's own validity-rule migration cites) -- these are also
 * DB-enforced via `check` constraints on the migration itself (a genuinely closed, stable
 * vocabulary), unlike `sub_supply_type`.
 */

export type CatalogEntry<Code extends string> = {
  code: Code;
  label: string;
  description: string;
};

export const TRANSACTION_TYPE_CATALOG: CatalogEntry<TransactionType>[] = [
  {
    code: "regular",
    label: "Regular",
    description: "Only a bill-from (consignor) and bill-to (consignee) address are involved -- the common case.",
  },
  {
    code: "bill_to_ship_to",
    label: "Bill To - Ship To",
    description: "Goods are billed to one party but shipped to a different address (a third-party ship-to location).",
  },
  {
    code: "bill_from_dispatch_from",
    label: "Bill From - Dispatch From",
    description: "Goods are billed by the registered business but physically dispatched from a different location (e.g. a warehouse).",
  },
  {
    code: "combination_bill_to_ship_to_and_bill_from_dispatch_from",
    label: "Combination of Bill To - Ship To and Bill From - Dispatch From",
    description: "Both the ship-to and dispatch-from locations differ from the billing parties' own addresses.",
  },
];

export const SUB_SUPPLY_TYPE_CATALOG: CatalogEntry<SubSupplyType>[] = [
  { code: "supply", label: "Supply", description: "Regular sale on the basis of a tax invoice or bill of supply." },
  { code: "export", label: "Export", description: "Outward supply of goods being exported." },
  { code: "job_work", label: "Job Work", description: "Goods sent for processing or job work at another location." },
  {
    code: "skd_ckd_lots",
    label: "SKD/CKD/Lots",
    description: "Semi-knocked-down or completely-knocked-down goods, or goods sent in lots.",
  },
  {
    code: "recipient_not_known",
    label: "Recipient Not Known",
    description: "The recipient of the goods is not yet known to the supplier at the time of movement.",
  },
  { code: "for_own_use", label: "For Own Use", description: "Branch transfers or stock transfers for the business's own use." },
  {
    code: "exhibition_or_fair",
    label: "Exhibition or Fair",
    description: "Goods moved for an exhibition or fair, to a place with no permanent business establishment.",
  },
  { code: "line_sales", label: "Line Sales", description: "Goods sent from one production line to another (e.g. between factories)." },
  { code: "others", label: "Others", description: "Any other outward supply not covered by the categories above." },
];

export const TRANSPORT_MODE_CATALOG: CatalogEntry<TransportMode>[] = [
  { code: "road", label: "Road", description: "Movement by road vehicle." },
  { code: "rail", label: "Rail", description: "Movement by railway." },
  { code: "air", label: "Air", description: "Movement by air." },
  { code: "ship", label: "Ship", description: "Movement by ship or other waterway vessel." },
];

export const VEHICLE_TYPE_CATALOG: CatalogEntry<VehicleType>[] = [
  { code: "regular", label: "Regular", description: "An ordinary vehicle/conveyance." },
  {
    code: "over_dimensional_cargo",
    label: "Over Dimensional Cargo (ODC)",
    description: "A cargo carried as a single indivisible unit exceeding the dimensional limits under Rule 93 of the Central Motor Vehicle Rules, 1989.",
  },
];

function makeLookup<Code extends string>(catalog: CatalogEntry<Code>[]) {
  const byCode = new Map(catalog.map((entry) => [entry.code, entry]));
  return {
    get: (code: string): CatalogEntry<Code> | undefined => byCode.get(code as Code),
    isSupported: (code: string): code is Code => byCode.has(code as Code),
  };
}

export const transactionTypes = makeLookup(TRANSACTION_TYPE_CATALOG);
export const subSupplyTypes = makeLookup(SUB_SUPPLY_TYPE_CATALOG);
export const transportModes = makeLookup(TRANSPORT_MODE_CATALOG);
export const vehicleTypes = makeLookup(VEHICLE_TYPE_CATALOG);
