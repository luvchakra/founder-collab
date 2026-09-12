import { describe, expect, it } from "vitest";
import { InvoiceNowUnreachableError, StubInvoiceNowAdapter } from "./adapter";

describe("StubInvoiceNowAdapter", () => {
  it("submit throws InvoiceNowUnreachableError naming the invoice, rather than fabricating a transmission result", async () => {
    const adapter = new StubInvoiceNowAdapter();
    await expect(
      adapter.submit({ invoiceId: "inv-1", buyerPeppolId: "0195:sguen201132058e", documentXml: "<xml/>", transmitToIras: true }),
    ).rejects.toThrow(InvoiceNowUnreachableError);
  });

  it("status also throws InvoiceNowUnreachableError, rather than fabricating a status result", async () => {
    const adapter = new StubInvoiceNowAdapter();
    await expect(adapter.status({ peppolMessageId: "msg-1" })).rejects.toThrow(InvoiceNowUnreachableError);
  });
});
