import { describe, expect, it } from "vitest";
import { DeEinvoicingUnreachableError, StubDeEinvoicingAdapter } from "./adapter";

describe("StubDeEinvoicingAdapter", () => {
  it("throws DeEinvoicingUnreachableError naming the invoice, rather than fabricating a transmission result", async () => {
    const adapter = new StubDeEinvoicingAdapter();
    await expect(adapter.submit({ invoiceId: "inv-1", buyerLeitwegId: null, xmlPayload: "<xml/>" })).rejects.toThrow(
      DeEinvoicingUnreachableError,
    );
  });
});
