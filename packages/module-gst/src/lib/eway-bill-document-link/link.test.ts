import { describe, expect, it } from "vitest";
import { isEwayBillGenerated } from "./link";
import type { EwayBill } from "../eway-bill/types";

function makeEwayBill(overrides: Partial<EwayBill> = {}): EwayBill {
  return {
    id: "ewb-row-1",
    business_id: "biz-1",
    document_id: "doc-1",
    status: "generated",
    eway_bill_number: "111000609282",
    valid_until: null,
    qr_code: null,
    cancel_reason: null,
    cancelled_at: null,
    raw_response: null,
    created_at: "2026-09-12T00:00:00Z",
    updated_at: "2026-09-12T00:00:00Z",
    ...overrides,
  };
}

describe("isEwayBillGenerated", () => {
  it("is false when no e-way bill row exists at all", () => {
    expect(isEwayBillGenerated(null)).toBe(false);
  });

  it("is true for a 'generated' row", () => {
    expect(isEwayBillGenerated(makeEwayBill({ status: "generated" }))).toBe(true);
  });

  it("is false for a 'cancelled' row -- a cancelled e-way bill no longer counts as generated", () => {
    expect(isEwayBillGenerated(makeEwayBill({ status: "cancelled" }))).toBe(false);
  });
});
