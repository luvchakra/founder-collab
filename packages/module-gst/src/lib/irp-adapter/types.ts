/**
 * COMPLY-P0-05.3 (IRP Adapter): "Provider interface: submit, status, cancel, fetch." The
 * backlog's own universal rule 7 ("government integrations must be adapter-based") applied
 * to India's e-invoicing IRP -- until now, `lib/einvoicing/mutations.ts`'s
 * `generateEinvoice`/`cancelEinvoice` called `lib/gsp-client.ts`'s own `callGsp` directly,
 * inline, with no formal interface a caller could depend on or a future non-GSP provider
 * could implement instead. This is that interface -- provider-agnostic on purpose (a
 * direct-to-IRP integration, or a second GSP, implements the same shape without any other
 * code in this module needing to change), even though the only implementation this story
 * ships (`gsp-adapter.ts`) is still GSP-based, matching the existing credentials model.
 *
 * Every method's request/response shape mirrors the real NIC e-invoice (IRP) API fields
 * this module's existing `generateEinvoice`/`cancelEinvoice` already use (DocDtls/ValDtls
 * in, Irn/AckNo/AckDt/SignedQRCode out) -- not an invented shape, though still the same
 * "not a fully IRP-compliant payload" simplification `generateEinvoice`'s own docstring
 * already names (seller/buyer GSTIN, item lines, etc. are not sent).
 */

export type IrpSubmitRequest = {
  docNumber: string;
  docDate: string;
  assessableValue: number;
  cgstValue: number;
  sgstValue: number;
  igstValue: number;
  totalValue: number;
};

export type IrpSubmitResponse = {
  irn: string | null;
  ackNo: string | null;
  ackDate: string | null;
  qrCode: string | null;
  /** COMPLY-P0-05.4 (IRN/QR Response): the complete, unmodified government response body
   * -- kept alongside the four extracted identifiers above so nothing the IRP actually
   * returned is ever lost to this platform's own narrower field selection. The four
   * extracted fields remain what this module operates on day to day (persisted on
   * `gst.einvoices` for direct reads); `raw` is the verbatim evidence record, persisted
   * into `gst.einvoices.raw_response` and left otherwise unused until a future story
   * (COMPLY-P0-10.2 "Government Response Store") builds a real evidence view around it. */
  raw: Record<string, unknown>;
};

export type IrpCancelRequest = {
  irn: string;
  /** GSTN's own fixed reason-code vocabulary (1=Duplicate, 2=Data entry mistake, 3=Order
   * cancelled, 4=Other) -- passed through as-is, not validated here; the caller (this
   * module's own `cancelEinvoice`) already has its own reason text, this adapter doesn't
   * invent a new vocabulary. */
  reasonCode: string;
  remarks: string;
};

export type IrpStatusRequest = {
  irn: string;
};

/** Deliberately a loose passthrough (`[key: string]: unknown` alongside `irn`/`status`) --
 * unlike `submit`'s response, this module has no existing persisted shape for "get IRN
 * status" to normalize into yet (that's a decision for whichever future story, e.g.
 * COMPLY-P0-05.6 E-Invoice Status, actually consumes this on an ongoing basis). Never
 * silently dropping fields a real GSP response might carry is safer than guessing a
 * narrower shape now. */
export type IrpStatusResponse = {
  irn: string;
  status: string;
  [key: string]: unknown;
};

export type IrpFetchRequest = {
  irn: string;
};

/** Same "loose passthrough" reasoning as `IrpStatusResponse` -- a full invoice payload's
 * shape varies by provider and this module doesn't yet have a caller that needs to parse
 * it into anything more specific. */
export type IrpFetchResponse = Record<string, unknown>;

/** The provider-agnostic contract every IRP integration in this module goes through. */
export interface IrpAdapter {
  submit(request: IrpSubmitRequest): Promise<IrpSubmitResponse>;
  status(request: IrpStatusRequest): Promise<IrpStatusResponse>;
  cancel(request: IrpCancelRequest): Promise<void>;
  fetch(request: IrpFetchRequest): Promise<IrpFetchResponse>;
}
