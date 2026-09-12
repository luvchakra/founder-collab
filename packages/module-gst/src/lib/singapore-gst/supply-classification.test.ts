import { describe, expect, it } from "vitest";
import { classifySgSupply } from "./supply-classification";

describe("classifySgSupply", () => {
  it("classifies a Singapore buyer as domestic, case-insensitively, by name or code", () => {
    expect(classifySgSupply("Singapore")).toEqual({ treatment: "domestic" });
    expect(classifySgSupply("singapore")).toEqual({ treatment: "domestic" });
    expect(classifySgSupply("SG")).toEqual({ treatment: "domestic" });
    expect(classifySgSupply("sg")).toEqual({ treatment: "domestic" });
  });

  it("classifies any other country as export", () => {
    expect(classifySgSupply("Malaysia")).toEqual({ treatment: "export" });
    expect(classifySgSupply("US")).toEqual({ treatment: "export" });
  });

  it("classifies a missing/blank country as unknown, never defaulted to domestic", () => {
    expect(classifySgSupply(null)).toEqual({ treatment: "unknown" });
    expect(classifySgSupply("")).toEqual({ treatment: "unknown" });
    expect(classifySgSupply("   ")).toEqual({ treatment: "unknown" });
  });
});
