import { callGsp, callGspGet, type GspCredentials } from "../gsp-client";
import type {
  EwayBillAdapter,
  EwayBillCancelRequest,
  EwayBillExtendRequest,
  EwayBillExtendResponse,
  EwayBillGenerateRequest,
  EwayBillGenerateResponse,
  EwayBillStatusRequest,
  EwayBillStatusResponse,
  EwayBillUpdateVehicleRequest,
  EwayBillUpdateVehicleResponse,
} from "./types";

export type GspEwayBillAdapterUrls = {
  generateUrl: string;
  cancelUrl: string;
  /** `null` when this business hasn't configured one yet -- `updateVehicle()`/`extend()`/
   * `status()` below throw a clear, actionable error rather than guessing at a URL. */
  vehicleUpdateUrl: string | null;
  extendUrl: string | null;
  statusUrl: string | null;
};

/** Pure: the real NIC e-Way Bill generate request shape `generateEwayBill` already sent
 * inline -- extracted here, unchanged, so the mapping is testable without mocking
 * `fetch`. Same deliberate simplification `generateEwayBill`'s own docstring already
 * names (only docNo/docDate/totalValue, not a fully NIC-compliant payload). */
export function buildGeneratePayload(request: EwayBillGenerateRequest): Record<string, unknown> {
  return { docNo: request.docNumber, docDate: request.docDate, totalValue: request.totalValue };
}

/** Pure: normalizes the GSP's own ewbNo/validUpto/signedQRCode response fields into
 * `EwayBillGenerateResponse` -- the exact mapping `generateEwayBill` already did inline. */
export function parseGenerateResponse(response: Record<string, unknown>): EwayBillGenerateResponse {
  return {
    ewbNo: (response.ewbNo as string | undefined) ?? null,
    validUpto: (response.validUpto as string | undefined) ?? null,
    qrCode: (response.signedQRCode as string | undefined) ?? null,
    raw: response,
  };
}

/** Pure: the real NIC VEHEWB ("Update Vehicle Number"/Part-B) request shape. */
export function buildUpdateVehiclePayload(request: EwayBillUpdateVehicleRequest): Record<string, unknown> {
  return {
    ewbNo: request.ewbNo,
    vehicleNo: request.vehicleNo,
    fromPlace: request.fromPlace,
    fromState: request.fromState,
    reasonCode: request.reasonCode,
    reasonRem: request.reasonRem,
    ...(request.transDocNo !== undefined ? { transDocNo: request.transDocNo } : {}),
    ...(request.transDocDate !== undefined ? { transDocDate: request.transDocDate } : {}),
    ...(request.transMode !== undefined ? { transMode: request.transMode } : {}),
    ...(request.vehicleType !== undefined ? { vehicleType: request.vehicleType } : {}),
  };
}

/** Pure: the real NIC ExtendEWB ("Extend Validity") request shape. */
export function buildExtendPayload(request: EwayBillExtendRequest): Record<string, unknown> {
  return {
    ewbNo: request.ewbNo,
    remainingDistance: request.remainingDistance,
    extnRsnCode: request.extnRsnCode,
    extnRemarks: request.extnRemarks,
    ...(request.vehicleNo !== undefined ? { vehicleNo: request.vehicleNo } : {}),
    ...(request.fromPlace !== undefined ? { fromPlace: request.fromPlace } : {}),
    ...(request.fromState !== undefined ? { fromState: request.fromState } : {}),
    ...(request.fromPincode !== undefined ? { fromPincode: request.fromPincode } : {}),
    ...(request.transDocNo !== undefined ? { transDocNo: request.transDocNo } : {}),
    ...(request.transDocDate !== undefined ? { transDocDate: request.transDocDate } : {}),
    ...(request.transMode !== undefined ? { transMode: request.transMode } : {}),
    ...(request.consignmentStatus !== undefined ? { consignmentStatus: request.consignmentStatus } : {}),
    ...(request.transitType !== undefined ? { transitType: request.transitType } : {}),
  };
}

/** Pure: normalizes an ExtendEWB response -- per this session's research, a successful
 * extension "returns the e-way bill number, updated date, and valid upto timestamp";
 * `validUpto` is extracted (the one figure a caller actually needs to know the movement
 * remains covered), everything else stays in `raw`. */
export function parseExtendResponse(ewbNo: string, response: Record<string, unknown>): EwayBillExtendResponse {
  return {
    ewbNo: (response.ewbNo as string | undefined) ?? ewbNo,
    validUpto: (response.validUpto as string | undefined) ?? null,
    raw: response,
  };
}

/** Pure: the real NIC CancelEWB request shape -- unchanged from what `cancelEwayBill`
 * already sent inline. */
export function buildCancelPayload(request: EwayBillCancelRequest): Record<string, unknown> {
  return { ewbNo: request.ewbNo, cancelRsnCode: request.cancelRsnCode, cancelRmrk: request.cancelRmrk };
}

/** Pure: appends an e-way bill number as a path segment onto a configured base status
 * URL -- same convention `buildIrnUrl` (COMPLY-P0-05.3) established for the IRP adapter's
 * own status/fetch endpoints, applied here for consistency; a provider whose own status
 * endpoint instead expects a query parameter would need its own `statusUrl` configured
 * with that in mind (this module doesn't invent a second URL-building convention without
 * a concrete provider that needs one). */
export function buildEwbNoUrl(baseUrl: string, ewbNo: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/${encodeURIComponent(ewbNo)}`;
}

/**
 * COMPLY-P0-06.3 (E-Way Adapter): the GSP-based `EwayBillAdapter` implementation --
 * `generate`/`cancel` are the exact same requests `generateEwayBill`/`cancelEwayBill`
 * already made (now expressed through this formal interface instead of calling `callGsp`
 * inline); `updateVehicle`/`extend`/`status` are genuinely new capabilities.
 */
export function createGspEwayBillAdapter(urls: GspEwayBillAdapterUrls, credentials: GspCredentials): EwayBillAdapter {
  return {
    async generate(request) {
      const response = await callGsp(urls.generateUrl, credentials, buildGeneratePayload(request));
      return parseGenerateResponse(response);
    },

    async updateVehicle(request): Promise<EwayBillUpdateVehicleResponse> {
      if (!urls.vehicleUpdateUrl) {
        throw new Error(
          "No vehicle-update URL is configured for this business's e-Way Bill provider -- add one in e-Way Bill settings to update Part-B (vehicle) details.",
        );
      }
      const response = await callGsp(urls.vehicleUpdateUrl, credentials, buildUpdateVehiclePayload(request));
      return { ewbNo: (response.ewbNo as string | undefined) ?? request.ewbNo, raw: response };
    },

    async extend(request): Promise<EwayBillExtendResponse> {
      if (!urls.extendUrl) {
        throw new Error(
          "No extend-validity URL is configured for this business's e-Way Bill provider -- add one in e-Way Bill settings to extend validity.",
        );
      }
      const response = await callGsp(urls.extendUrl, credentials, buildExtendPayload(request));
      return parseExtendResponse(request.ewbNo, response);
    },

    async cancel(request) {
      await callGsp(urls.cancelUrl, credentials, buildCancelPayload(request));
    },

    async status(request: EwayBillStatusRequest): Promise<EwayBillStatusResponse> {
      if (!urls.statusUrl) {
        throw new Error(
          "No status URL is configured for this business's e-Way Bill provider -- add one in e-Way Bill settings to check e-way bill status.",
        );
      }
      const response = await callGspGet(buildEwbNoUrl(urls.statusUrl, request.ewbNo), credentials);
      return {
        ...response,
        ewbNo: (response.ewbNo as string | undefined) ?? request.ewbNo,
        status: (response.status as string | undefined) ?? "unknown",
      };
    },
  };
}
