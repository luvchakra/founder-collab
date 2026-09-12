import { describe, expect, it } from "vitest";
import { BeEinvoicingUnreachableError, StubBeEinvoicingAdapter } from "./adapter";

describe("StubBeEinvoicingAdapter", () => {
  it("throws BeEinvoicingUnreachableError naming the invoice, rather than fabricating a transmission result", async () => {
    const adapter = new StubBeEinvoicingAdapter();
    await expect(adapter.submit({ invoiceId: "inv-1", peppolParticipantId: "0208:1234", ublPayload: "<xml/>" })).rejects.toThrow(
      BeEinvoicingUnreachableError,
    );
  });
});
