import type { BeEinvoicingAdapter, BeEinvoicingSubmitRequest, BeEinvoicingSubmitResponse } from "./types";

/**
 * COMPLY-P1-01.6: Belgian Peppol transmission requires a real access-point connection this
 * environment has no credentials for, and this story found no public Peppol test
 * access-point this session could integrate against. Clearly-labeled stub -- same posture
 * as every other adapter in this story.
 */
export class BeEinvoicingUnreachableError extends Error {
  constructor(invoiceId: string) {
    super(
      `Cannot submit invoice ${invoiceId} for Belgian e-invoice transmission -- no Peppol access-point credentials are configured in this environment. This adapter's own interface (BeEinvoicingAdapter) is ready for a real implementation once one is available.`,
    );
  }
}

export class StubBeEinvoicingAdapter implements BeEinvoicingAdapter {
  async submit(request: BeEinvoicingSubmitRequest): Promise<BeEinvoicingSubmitResponse> {
    throw new BeEinvoicingUnreachableError(request.invoiceId);
  }
}
