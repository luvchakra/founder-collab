import type { DeEinvoicingAdapter, DeEinvoicingSubmitRequest, DeEinvoicingSubmitResponse } from "./types";

/**
 * COMPLY-P1-01.6: Germany has no single national clearance portal this session could
 * locate a public sandbox/test endpoint for (unlike India's own NIC/GSP sandbox, or
 * Poland's own well-documented KSeF test environment) -- German B2B e-invoice exchange is
 * decentralized (direct exchange between trading partners, or via a Peppol access point),
 * and no credentials for either exist in this environment. `StubDeEinvoicingAdapter` is a
 * clearly-labeled stub, never a disguised fake -- it always throws rather than fabricating
 * a transmission result, the same posture `StubViesAdapter` already takes for VIES.
 */
export class DeEinvoicingUnreachableError extends Error {
  constructor(invoiceId: string) {
    super(
      `Cannot submit invoice ${invoiceId} for German e-invoice transmission -- no Peppol access-point or direct-exchange credentials are configured in this environment, and this story found no public sandbox endpoint to integrate against. This adapter's own interface (DeEinvoicingAdapter) is ready for a real implementation once one is available.`,
    );
  }
}

export class StubDeEinvoicingAdapter implements DeEinvoicingAdapter {
  async submit(request: DeEinvoicingSubmitRequest): Promise<DeEinvoicingSubmitResponse> {
    throw new DeEinvoicingUnreachableError(request.invoiceId);
  }
}
