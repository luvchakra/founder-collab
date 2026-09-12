import type { InvoiceNowAdapter, InvoiceNowStatusRequest, InvoiceNowStatusResponse, InvoiceNowSubmitRequest, InvoiceNowSubmitResponse } from "./types";

/**
 * COMPLY-P1-04.5 (InvoiceNow Adapter): no real Peppol Access Point credentials, and no
 * public sandbox endpoint this session could locate to integrate against even for
 * testing (unlike India's own NIC/GSP sandbox) -- the same posture `StubDeEinvoicingAdapter`
 * (COMPLY-P1-01.6) already established for Germany's own decentralized e-invoicing
 * exchange. `StubInvoiceNowAdapter` is a clearly-labeled stub, never a disguised fake --
 * it always throws rather than fabricating a transmission result. `InvoiceNowAdapter`'s
 * own interface (see `types.ts`) is ready for a real Access Point provider integration
 * once one is available; nothing else in this module needs to change to plug one in.
 */
export class InvoiceNowUnreachableError extends Error {
  constructor(invoiceId: string) {
    super(
      `Cannot submit invoice ${invoiceId} for GST InvoiceNow transmission -- no Peppol Access Point credentials are configured in this environment, and this story found no public sandbox endpoint to integrate against. This adapter's own interface (InvoiceNowAdapter) is ready for a real implementation once one is available.`,
    );
  }
}

export class StubInvoiceNowAdapter implements InvoiceNowAdapter {
  async submit(request: InvoiceNowSubmitRequest): Promise<InvoiceNowSubmitResponse> {
    throw new InvoiceNowUnreachableError(request.invoiceId);
  }

  async status(request: InvoiceNowStatusRequest): Promise<InvoiceNowStatusResponse> {
    throw new InvoiceNowUnreachableError(request.peppolMessageId);
  }
}
