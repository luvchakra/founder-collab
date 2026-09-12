import { callGsp, callGspGet, type GspCredentials } from "../gsp-client";
import type {
  IrpAdapter,
  IrpCancelRequest,
  IrpFetchRequest,
  IrpFetchResponse,
  IrpStatusRequest,
  IrpStatusResponse,
  IrpSubmitRequest,
  IrpSubmitResponse,
} from "./types";

export type GspIrpAdapterUrls = {
  generateUrl: string;
  cancelUrl: string;
  /** `null` when this business hasn't configured one yet -- `status()`/`fetch()` below
   * throw a clear, actionable error rather than guessing at a URL. */
  statusUrl: string | null;
  fetchUrl: string | null;
};

/** Pure: the real NIC e-invoice DocDtls/ValDtls request shape `generateEinvoice` already
 * sent inline -- extracted here, unchanged, so the mapping is testable without mocking
 * `fetch` (this module's established "pure core function, thin orchestrator" convention,
 * applied to a request BUILDER rather than a business-rule function this time). */
export function buildSubmitPayload(request: IrpSubmitRequest): Record<string, unknown> {
  return {
    DocDtls: { No: request.docNumber, Dt: request.docDate },
    ValDtls: {
      AssVal: request.assessableValue,
      CgstVal: request.cgstValue,
      SgstVal: request.sgstValue,
      IgstVal: request.igstValue,
      TotInvVal: request.totalValue,
    },
  };
}

/** Pure: the inverse of `buildSubmitPayload` -- normalizes the IRP's own
 * Irn/AckNo/AckDt/SignedQRCode response fields into `IrpSubmitResponse`, exactly the
 * mapping `generateEinvoice` already did inline before COMPLY-P0-05.3. COMPLY-P0-05.4
 * added `raw`, the complete unmodified response, alongside the four extracted fields --
 * see `IrpSubmitResponse`'s own docstring for why. */
export function parseSubmitResponse(response: Record<string, unknown>): IrpSubmitResponse {
  return {
    irn: (response.Irn as string | undefined) ?? null,
    ackNo: (response.AckNo as string | undefined) ?? null,
    ackDate: (response.AckDt as string | undefined) ?? null,
    qrCode: (response.SignedQRCode as string | undefined) ?? null,
    raw: response,
  };
}

/** Pure: the real NIC cancel request shape (`Irn`/`CnlRsn`/`CnlRem`), unchanged from what
 * `cancelEinvoice` already sent inline. */
export function buildCancelPayload(request: IrpCancelRequest): Record<string, unknown> {
  return { Irn: request.irn, CnlRsn: request.reasonCode, CnlRem: request.remarks };
}

/**
 * Pure: appends an IRN as a path segment onto a configured base status/fetch URL -- the
 * real NIC "Get IRN details by IRN" endpoint shape (`.../Invoice/irn/{irn}`). Extracted so
 * this convention is documented and unit-testable in one place rather than inlined twice
 * (once for `status`, once for `fetch`). Trims a trailing slash on the base first so
 * `".../irn/"` and `".../irn"` both produce `".../irn/<irn>"`, never a double slash.
 */
export function buildIrnUrl(baseUrl: string, irn: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/${encodeURIComponent(irn)}`;
}

/**
 * COMPLY-P0-05.3 (IRP Adapter): the GSP-based `IrpAdapter` implementation --
 * `submit`/`cancel` are the exact same requests `generateEinvoice`/`cancelEinvoice`
 * already made (now expressed through this formal interface instead of calling
 * `callGsp` inline); `status`/`fetch` are genuinely new capabilities this module never
 * had a way to invoke before, since `gst.einvoice_credentials` never stored a
 * `status_url`/`fetch_url` until this story's own migration added them.
 */
export function createGspIrpAdapter(urls: GspIrpAdapterUrls, credentials: GspCredentials): IrpAdapter {
  return {
    async submit(request) {
      const response = await callGsp(urls.generateUrl, credentials, buildSubmitPayload(request));
      return parseSubmitResponse(response);
    },

    async cancel(request) {
      await callGsp(urls.cancelUrl, credentials, buildCancelPayload(request));
    },

    async status(request: IrpStatusRequest): Promise<IrpStatusResponse> {
      if (!urls.statusUrl) {
        throw new Error(
          "No status URL is configured for this business's e-Invoicing provider -- add one in e-Invoicing settings to check IRN status.",
        );
      }
      const response = await callGspGet(buildIrnUrl(urls.statusUrl, request.irn), credentials);
      return {
        ...response,
        irn: (response.Irn as string | undefined) ?? request.irn,
        status: (response.Status as string | undefined) ?? "unknown",
      };
    },

    async fetch(request: IrpFetchRequest): Promise<IrpFetchResponse> {
      if (!urls.fetchUrl) {
        throw new Error(
          "No fetch URL is configured for this business's e-Invoicing provider -- add one in e-Invoicing settings to retrieve invoice details.",
        );
      }
      return callGspGet(buildIrnUrl(urls.fetchUrl, request.irn), credentials);
    },
  };
}
