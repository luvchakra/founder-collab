import { describe, expect, it } from "vitest";
import { isIndiaGstRegistration } from "./mutations";

/** COMPLY-P0-04.1's own guard on `mirrorPrimaryGstinToBusinessSettings` -- the one real
 * branch of new logic this story adds to the mutation layer, extracted as a pure
 * function so it's testable without a live database connection (this module's own
 * established "extract the real branch logic" convention -- `mapItemTaxContext`,
 * `selectPartyAddress`, ...). */
describe("isIndiaGstRegistration", () => {
  it("mirrors for India GST, the only regime core.business_settings.gstin/state means anything for", () => {
    expect(isIndiaGstRegistration("IN", "GST")).toBe(true);
  });

  it("never mirrors a non-India country, even a planned regime named 'GST'", () => {
    expect(isIndiaGstRegistration("CA", "GST")).toBe(false);
  });

  it("never mirrors a non-GST regime within India (e.g. a future composition-only regime code)", () => {
    expect(isIndiaGstRegistration("IN", "VAT")).toBe(false);
  });

  it("is case-sensitive -- catalog codes are always upper-cased before storage, so a lowercase mismatch is a bug to surface, not silently accept", () => {
    expect(isIndiaGstRegistration("in", "gst")).toBe(false);
  });
});
