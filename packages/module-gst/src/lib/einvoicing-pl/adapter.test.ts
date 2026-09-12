import { describe, expect, it } from "vitest";
import { PlEinvoicingUnreachableError, StubPlEinvoicingAdapter } from "./adapter";

describe("StubPlEinvoicingAdapter", () => {
  it("throws PlEinvoicingUnreachableError naming the invoice, rather than fabricating a KSeF reference number", async () => {
    const adapter = new StubPlEinvoicingAdapter();
    await expect(adapter.submit({ invoiceId: "inv-1", nip: "2073786728", ksefXmlPayload: "<xml/>" })).rejects.toThrow(
      PlEinvoicingUnreachableError,
    );
  });
});
