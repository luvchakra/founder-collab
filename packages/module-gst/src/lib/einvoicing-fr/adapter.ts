import type { FrEinvoicingAdapter, FrEinvoicingSubmitRequest, FrEinvoicingSubmitResponse } from "./types";

/**
 * COMPLY-P1-01.6: France transmits via a Plateforme de Dématérialisation Partenaire (PDP)
 * or the public Portail Public de Facturation (PPF) -- both require a real registered PDP
 * account or PPF access this environment has no credentials for, and this story found no
 * public sandbox this session could integrate against. Clearly-labeled stub, same posture
 * as `StubDeEinvoicingAdapter`/`StubViesAdapter` -- always throws, never fabricates.
 */
export class FrEinvoicingUnreachableError extends Error {
  constructor(invoiceId: string) {
    super(
      `Cannot submit invoice ${invoiceId} for French e-invoice transmission -- no Plateforme de Dématérialisation Partenaire (PDP) or Portail Public de Facturation (PPF) credentials are configured in this environment. This adapter's own interface (FrEinvoicingAdapter) is ready for a real implementation once one is available.`,
    );
  }
}

export class StubFrEinvoicingAdapter implements FrEinvoicingAdapter {
  async submit(request: FrEinvoicingSubmitRequest): Promise<FrEinvoicingSubmitResponse> {
    throw new FrEinvoicingUnreachableError(request.invoiceId);
  }
}
