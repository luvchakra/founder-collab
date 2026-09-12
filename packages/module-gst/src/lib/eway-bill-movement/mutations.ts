import { requireModule } from "@cofounderai/core/licensing/queries";
import { requirePermission } from "@cofounderai/core/rbac/require-permission";
import { createClient } from "../../db/server";
import { isEwayBillGenerated } from "../eway-bill-document-link/link";
import { getEwayBillForDocument } from "../eway-bill/queries";
import { subSupplyTypes, transactionTypes, transportModes, vehicleTypes } from "./catalog";
import type { EwayBillMovementInput } from "./types";

/**
 * COMPLY-P0-06.2 (Movement Data): records or updates the consignor/consignee overrides,
 * transport/vehicle facts, distance, and supply-type classification for one document's
 * e-way bill preparation. Upsert on `(business_id, document_id)` -- there is exactly one
 * movement record per document, built up incrementally (a caller fills in whichever
 * fields it knows now; earlier fields already recorded are left alone unless this call
 * explicitly overwrites them).
 *
 * Gated on `gst.generate` (the SAME permission `generateEwayBill`/`generateEinvoice`
 * already require), not `settings.manage` -- this is preparatory data for the generation
 * workflow itself, not a settings change (see the migration's own RLS comment for the
 * full reasoning).
 *
 * Every classification field is validated against its own catalog before being written --
 * defense in depth matching `createTaxRegistration`'s own
 * `isRegimeSupported`/`canonicalJurisdictionName` checks (the DB's own `check` constraints
 * back up `transactionType`/`vehicleType`/`transportMode` regardless; `subSupplyType` has
 * NO db-level check at all -- see the table migration's own comment -- so this
 * application-level validation is the only gate for it).
 *
 * `undefined` on an optional input field means "leave whatever is already stored alone";
 * an explicit `null` means "clear this field" -- built by only including keys the caller
 * actually passed in the upsert payload, so an omitted key never overwrites an existing
 * value on update (and simply takes its column default on a first insert).
 *
 * COMPLY-P0-06.4 (Document Link): refuses to edit movement data once a real (non-
 * cancelled) e-way bill has actually been generated for this document
 * (`isEwayBillGenerated`) -- the point at which this data becomes LINKED to that
 * generated e-way bill and preserving what it said at generation time matters more than
 * letting it keep changing (backlog rule 13, "preserve historical filing/evidence
 * state"). Cancelling the e-way bill (`cancelEwayBill`) unlocks it again, since a
 * cancelled bill's own movement facts are no longer binding on anything real.
 */
export async function upsertEwayBillMovement(
  businessId: string,
  documentId: string,
  input: EwayBillMovementInput,
): Promise<void> {
  await requireModule(businessId, "gst");
  await requirePermission(businessId, "gst.generate");

  const existingEwayBill = await getEwayBillForDocument(businessId, documentId);
  if (isEwayBillGenerated(existingEwayBill)) {
    throw new Error(
      `An e-Way Bill (${existingEwayBill?.eway_bill_number ?? "unknown number"}) has already been generated for this document -- movement data is locked. Cancel the e-Way Bill first if these details need to change.`,
    );
  }

  if (input.transactionType !== undefined && !transactionTypes.isSupported(input.transactionType)) {
    throw new Error(`"${input.transactionType}" isn't a recognized e-way bill transaction type.`);
  }
  if (input.subSupplyType != null && !subSupplyTypes.isSupported(input.subSupplyType)) {
    throw new Error(`"${input.subSupplyType}" isn't a recognized e-way bill sub-supply type.`);
  }
  if (input.transportMode != null && !transportModes.isSupported(input.transportMode)) {
    throw new Error(`"${input.transportMode}" isn't a recognized transport mode.`);
  }
  if (input.vehicleType !== undefined && !vehicleTypes.isSupported(input.vehicleType)) {
    throw new Error(`"${input.vehicleType}" isn't a recognized vehicle type.`);
  }
  if (input.distanceKm != null && (!Number.isFinite(input.distanceKm) || input.distanceKm < 0)) {
    throw new Error("Distance (km) must be a non-negative number.");
  }

  const payload: Record<string, unknown> = { business_id: businessId, document_id: documentId };
  if (input.transactionType !== undefined) payload.transaction_type = input.transactionType;
  if (input.subSupplyType !== undefined) payload.sub_supply_type = input.subSupplyType;
  if (input.transportMode !== undefined) payload.transport_mode = input.transportMode;
  if (input.vehicleType !== undefined) payload.vehicle_type = input.vehicleType;
  if (input.vehicleNumber !== undefined) payload.vehicle_number = input.vehicleNumber;
  if (input.transporterId !== undefined) payload.transporter_id = input.transporterId;
  if (input.transporterName !== undefined) payload.transporter_name = input.transporterName;
  if (input.transporterDocNumber !== undefined) payload.transporter_doc_number = input.transporterDocNumber;
  if (input.transporterDocDate !== undefined) payload.transporter_doc_date = input.transporterDocDate;
  if (input.distanceKm !== undefined) payload.distance_km = input.distanceKm;
  if (input.dispatchFromOverride !== undefined) payload.dispatch_from_override = input.dispatchFromOverride;
  if (input.shipToOverride !== undefined) payload.ship_to_override = input.shipToOverride;

  const supabase = await createClient();
  const { error } = await supabase.from("eway_bill_movements").upsert(payload, { onConflict: "business_id,document_id" });
  if (error) throw error;
}
