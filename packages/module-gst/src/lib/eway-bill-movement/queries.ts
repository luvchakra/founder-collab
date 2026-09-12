import { cache } from "react";
import { createClient } from "../../db/server";
import { createClient as createCoreClient } from "@cofounderai/core/db/server";
import { getDocumentContext } from "../core-transactions/queries";
import { getPartyTaxContext } from "../party-tax-context/queries";
import { getPrimaryTaxRegistration } from "../tax-registrations/queries";
import { getEffectiveEwayBillValidityRule, computeEwayBillValidityDays, type EwayBillValidityResult } from "./validity";
import type { PartyTaxContext } from "../party-tax-context/types";
import type { ConsignorDetails, EwayBillMovement, LocationOverride, VehicleType } from "./types";

function coreClient() {
  return createCoreClient({ schema: "core" });
}

/** Maps a `gst.eway_bill_movements` row to its camelCase shape. Exported so it's
 * independently testable, matching this module's own established convention
 * (`mapDocument`, `mapPartyAddress`, ...). */
export function mapEwayBillMovement(row: {
  id: string;
  business_id: string;
  document_id: string;
  transaction_type: string;
  sub_supply_type: string | null;
  transport_mode: string | null;
  vehicle_type: string;
  vehicle_number: string | null;
  transporter_id: string | null;
  transporter_name: string | null;
  transporter_doc_number: string | null;
  transporter_doc_date: string | null;
  distance_km: number | null;
  dispatch_from_override: LocationOverride | null;
  ship_to_override: LocationOverride | null;
  created_at: string;
  updated_at: string;
}): EwayBillMovement {
  return {
    id: row.id,
    businessId: row.business_id,
    documentId: row.document_id,
    transactionType: row.transaction_type as EwayBillMovement["transactionType"],
    subSupplyType: row.sub_supply_type as EwayBillMovement["subSupplyType"],
    transportMode: row.transport_mode as EwayBillMovement["transportMode"],
    vehicleType: row.vehicle_type as VehicleType,
    vehicleNumber: row.vehicle_number,
    transporterId: row.transporter_id,
    transporterName: row.transporter_name,
    transporterDocNumber: row.transporter_doc_number,
    transporterDocDate: row.transporter_doc_date,
    distanceKm: row.distance_km,
    dispatchFromOverride: row.dispatch_from_override,
    shipToOverride: row.ship_to_override,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** The movement record for one document, or `null` if none has been recorded yet -- most
 * documents never get one until a business actually starts preparing an e-way bill for
 * them. */
export const getEwayBillMovement = cache(
  async (businessId: string, documentId: string): Promise<EwayBillMovement | null> => {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("eway_bill_movements")
      .select("*")
      .eq("business_id", businessId)
      .eq("document_id", documentId)
      .maybeSingle();
    if (error) throw error;
    return data ? mapEwayBillMovement(data) : null;
  },
);

/**
 * The business's own default CONSIGNOR identity -- its primary India/GST registration
 * (COMPLY-P0-02.1/04.1) plus its business name, read live rather than duplicated onto
 * `gst.eway_bill_movements` (see that table's own migration comment). Every field is
 * `null`, never guessed, when the underlying `core`/`gst` data doesn't exist yet.
 */
export const getConsignorDetails = cache(async (businessId: string): Promise<ConsignorDetails> => {
  const [core, registration] = await Promise.all([
    coreClient(),
    getPrimaryTaxRegistration(businessId, "IN", "GST"),
  ]);
  const { data: business, error } = await core.from("businesses").select("name").eq("id", businessId).maybeSingle();
  if (error) throw error;

  return {
    businessName: business?.name ?? null,
    gstin: registration?.registration_number ?? null,
    state: registration?.jurisdiction ?? null,
  };
});

export type EwayBillMovementContext = {
  documentId: string;
  movement: EwayBillMovement | null;
  consignor: ConsignorDetails;
  consignee: PartyTaxContext;
  validity: EwayBillValidityResult;
};

export type EwayBillMovementContextInput = {
  /** Compute the validity-rule lookup as of this date instead of today (e.g. the
   * document's own dispatch date). */
  asOf?: string;
};

/**
 * COMPLY-P0-06.2's own combined read: the recorded movement data for a document (or
 * `null` if none yet), the business's own default consignor identity, the document's
 * party's own consignee tax context (COMPLY-P0-03.4), and the validity period the
 * recorded distance/vehicle type computes to under the currently-effective Rule 138(10)
 * figures. Returns `null` when the document itself doesn't exist for this business,
 * matching every other document-keyed orchestrator in this module.
 */
export async function getEwayBillMovementContext(
  businessId: string,
  documentId: string,
  input: EwayBillMovementContextInput = {},
): Promise<EwayBillMovementContext | null> {
  const [document, movement, consignor, validityRule] = await Promise.all([
    getDocumentContext(businessId, documentId),
    getEwayBillMovement(businessId, documentId),
    getConsignorDetails(businessId),
    getEffectiveEwayBillValidityRule(input.asOf),
  ]);
  if (!document) return null;

  const consignee = await getPartyTaxContext(businessId, document.partyId);

  const validity = computeEwayBillValidityDays({
    distanceKm: movement?.distanceKm ?? null,
    vehicleType: movement?.vehicleType ?? "regular",
    rule: validityRule,
  });

  return { documentId, movement, consignor, consignee, validity };
}
