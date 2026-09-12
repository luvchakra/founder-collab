import { describe, expect, it } from "vitest";
import { FrEinvoicingUnreachableError, StubFrEinvoicingAdapter } from "./adapter";

describe("StubFrEinvoicingAdapter", () => {
  it("throws FrEinvoicingUnreachableError naming the invoice, rather than fabricating a transmission result", async () => {
    const adapter = new StubFrEinvoicingAdapter();
    await expect(adapter.submit({ invoiceId: "inv-1", siret: "404833048", cctPayload: "<xml/>" })).rejects.toThrow(
      FrEinvoicingUnreachableError,
    );
  });
});
