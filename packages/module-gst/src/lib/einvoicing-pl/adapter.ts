import type { PlEinvoicingAdapter, PlEinvoicingSubmitRequest, PlEinvoicingSubmitResponse } from "./types";

/**
 * COMPLY-P1-01.6: KSeF is a real government clearance API with a documented public test
 * environment in principle, but this session has no registered NIP/certificate to
 * authenticate a test submission with, and this story's own network egress checks (the
 * `.gov.pl` family, same domain class as the other three countries' own government sites)
 * were not independently confirmed reachable either. Clearly-labeled stub -- same posture
 * as every other adapter in this story.
 */
export class PlEinvoicingUnreachableError extends Error {
  constructor(invoiceId: string) {
    super(
      `Cannot submit invoice ${invoiceId} to KSeF -- no Polish NIP/certificate credentials are configured in this environment. This adapter's own interface (PlEinvoicingAdapter) is ready for a real implementation once one is available.`,
    );
  }
}

export class StubPlEinvoicingAdapter implements PlEinvoicingAdapter {
  async submit(request: PlEinvoicingSubmitRequest): Promise<PlEinvoicingSubmitResponse> {
    throw new PlEinvoicingUnreachableError(request.invoiceId);
  }
}
