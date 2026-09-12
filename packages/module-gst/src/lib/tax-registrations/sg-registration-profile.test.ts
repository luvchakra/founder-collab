import { describe, expect, it } from "vitest";
import { buildSgRegistrationMetadata, isValidSgPeppolId, parseSgRegistrationProfile } from "./sg-registration-profile";

describe("isValidSgPeppolId", () => {
  it("accepts a real UEN-based Peppol ID, case-insensitively", () => {
    expect(isValidSgPeppolId("0195:sguen201132058e")).toBe(true);
    expect(isValidSgPeppolId("0195:SGUEN201132058E")).toBe(true);
  });

  it("accepts the GST-number-based scheme (available since Nov 2025)", () => {
    expect(isValidSgPeppolId("0195:sggstm90364879x")).toBe(true);
  });

  it("tolerates surrounding whitespace", () => {
    expect(isValidSgPeppolId("  0195:sguen201132058e  ")).toBe(true);
  });

  it("rejects a wrong scheme prefix", () => {
    expect(isValidSgPeppolId("9999:sguen201132058e")).toBe(false);
  });

  it("rejects a wrong subtype", () => {
    expect(isValidSgPeppolId("0195:deleitweg201132058e")).toBe(false);
  });

  it("rejects a missing identifier after the subtype", () => {
    expect(isValidSgPeppolId("0195:sguen")).toBe(false);
  });

  it("rejects a malformed string with no colon", () => {
    expect(isValidSgPeppolId("0195sguen201132058e")).toBe(false);
  });
});

describe("parseSgRegistrationProfile", () => {
  it("reads a valid stored Peppol ID", () => {
    expect(parseSgRegistrationProfile({ peppol_id: "0195:sguen201132058e" })).toEqual({ peppolId: "0195:sguen201132058e" });
  });

  it("defaults to null when unset", () => {
    expect(parseSgRegistrationProfile({})).toEqual({ peppolId: null });
  });

  it("defaults to null for a structurally-invalid stored value rather than throwing", () => {
    expect(parseSgRegistrationProfile({ peppol_id: "not-a-peppol-id" })).toEqual({ peppolId: null });
  });
});

describe("buildSgRegistrationMetadata", () => {
  it("merges a Peppol ID onto existing metadata without clobbering other keys", () => {
    expect(buildSgRegistrationMetadata({ some_other_key: "x" }, { peppolId: "0195:sguen201132058e" })).toEqual({
      some_other_key: "x",
      peppol_id: "0195:sguen201132058e",
    });
  });

  it("clears the key when the profile's peppolId is null", () => {
    expect(buildSgRegistrationMetadata({ peppol_id: "0195:sguen201132058e", some_other_key: "x" }, { peppolId: null })).toEqual({
      some_other_key: "x",
    });
  });
});
