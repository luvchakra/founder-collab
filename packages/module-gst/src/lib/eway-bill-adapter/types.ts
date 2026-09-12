/**
 * COMPLY-P0-06.3 (E-Way Adapter): "Generate/update/extend/cancel/status." The backlog's
 * own universal rule 7 ("government integrations must be adapter-based") applied to
 * India's e-way bill system, mirroring exactly how COMPLY-P0-05.3's `IrpAdapter` did the
 * same for e-invoicing -- until now, `lib/eway-bill/mutations.ts`'s
 * `generateEwayBill`/`cancelEwayBill` called `lib/gsp-client.ts`'s own `callGsp` directly,
 * inline, with no formal interface. This is that interface -- provider-agnostic (a
 * direct-to-NIC integration, or a second GSP, implements the same shape without any other
 * code in this module needing to change), even though the only implementation this story
 * ships (`gsp-adapter.ts`) is still GSP-based, matching the existing credentials model.
 *
 * Every request/response field name below is the real NIC e-Way Bill API's own field name
 * (confirmed via web search against the official docs.ewaybillgst.gov.in API
 * documentation, mirrored consistently by multiple independent GSP integrators --
 * MasterGST's own reference PDF, Vayana, ClearTax), not an invented shape -- though
 * `generate`'s own request stays the same deliberate simplification `generateEwayBill`
 * already made (only docNo/docDate/totalValue are sent, not a fully NIC-compliant
 * payload -- consignor/consignee/HSN/item lines etc. are not sent by this platform
 * today). `updateVehicle`/`extend` are genuinely new capabilities this module never had a
 * way to invoke before (`gst.eway_bill_credentials` never stored a `vehicle_update_url`/
 * `extend_url`/`status_url` until this story's own migration added them).
 */

export type EwayBillGenerateRequest = {
  docNumber: string;
  docDate: string;
  totalValue: number;
};

export type EwayBillGenerateResponse = {
  ewbNo: string | null;
  validUpto: string | null;
  qrCode: string | null;
  /** The complete, unmodified government response body -- same "never lose evidence to a
   * narrower field selection" reasoning as `IrpSubmitResponse.raw` (COMPLY-P0-05.4). */
  raw: Record<string, unknown>;
};

/** VEHEWB -- "Update Part-B" / vehicle number update. Field names per the NIC e-Way Bill
 * API's own "Update Vehicle Number" documentation: `ewbNo`, `vehicleNo`, `fromPlace`,
 * `fromState` (NIC's own 2-digit state code -- passed through as-is, not validated here),
 * `reasonCode`/`reasonRem`, plus the optional transporter-document fields needed when the
 * movement continues by a different transport document. */
export type EwayBillUpdateVehicleRequest = {
  ewbNo: string;
  vehicleNo: string;
  fromPlace: string;
  fromState: string;
  reasonCode: string;
  reasonRem: string;
  transDocNo?: string;
  transDocDate?: string;
  transMode?: string;
  vehicleType?: string;
};

export type EwayBillUpdateVehicleResponse = {
  ewbNo: string;
  /** The vehicle-update response's own exact field shape varies enough across GSP
   * integrators (unlike `generate`'s well-documented ewbNo/validUpto/signedQRCode) that
   * this module doesn't confidently extract anything beyond confirming which e-way bill
   * was updated -- `raw` carries whatever the provider actually returned. */
  raw: Record<string, unknown>;
};

/** ExtendEWB -- extend an e-way bill's validity based on the remaining distance still to
 * travel. Field names per the NIC e-Way Bill API's own "Extend Validity" documentation:
 * `ewbNo`, `remainingDistance`, `extnRsnCode`/`extnRemarks` (the extension's own reason
 * code/remark, distinct from `cancel`'s `cancelRsnCode`/`cancelRmrk`), plus the same
 * optional transporter/vehicle/place fields `updateVehicle` uses when the extension also
 * carries a Part-B update alongside it. */
export type EwayBillExtendRequest = {
  ewbNo: string;
  remainingDistance: number;
  extnRsnCode: string;
  extnRemarks: string;
  vehicleNo?: string;
  fromPlace?: string;
  fromState?: string;
  fromPincode?: string;
  transDocNo?: string;
  transDocDate?: string;
  transMode?: string;
  consignmentStatus?: string;
  transitType?: string;
};

export type EwayBillExtendResponse = {
  ewbNo: string;
  validUpto: string | null;
  raw: Record<string, unknown>;
};

/** CancelEWB -- the same request shape `cancelEwayBill` already sent inline
 * (`ewbNo`/`cancelRsnCode`/`cancelRmrk`), formalized through this interface. GSTN's own
 * fixed reason-code vocabulary (1=Duplicate, 2=Data entry mistake, 3=Order cancelled,
 * 4=Other) is passed through as-is, not validated here -- same posture
 * `IrpCancelRequest.reasonCode` already established. */
export type EwayBillCancelRequest = {
  ewbNo: string;
  cancelRsnCode: string;
  cancelRmrk: string;
};

export type EwayBillStatusRequest = {
  ewbNo: string;
};

/** Deliberately a loose passthrough (`[key: string]: unknown` alongside `ewbNo`/`status`)
 * -- same "no existing persisted shape to normalize into yet" reasoning as
 * `IrpStatusResponse` (COMPLY-P0-05.3). Deciding how a live status answer should update
 * `gst.eway_bills`'s own `status` column, if at all, is a future story's job, not this
 * one's -- this type only proves the adapter's `status` method is real and callable. */
export type EwayBillStatusResponse = {
  ewbNo: string;
  status: string;
  [key: string]: unknown;
};

/** The provider-agnostic contract every e-way bill integration in this module goes
 * through. */
export interface EwayBillAdapter {
  generate(request: EwayBillGenerateRequest): Promise<EwayBillGenerateResponse>;
  updateVehicle(request: EwayBillUpdateVehicleRequest): Promise<EwayBillUpdateVehicleResponse>;
  extend(request: EwayBillExtendRequest): Promise<EwayBillExtendResponse>;
  cancel(request: EwayBillCancelRequest): Promise<void>;
  status(request: EwayBillStatusRequest): Promise<EwayBillStatusResponse>;
}
