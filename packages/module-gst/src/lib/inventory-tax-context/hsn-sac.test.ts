import { describe, expect, it } from "vitest";
import {
  classifyHsnSacCode,
  hsnSacRequirementForKind,
  validateHsnSacCode,
  validateItemHsnSac,
} from "./hsn-sac";

describe("hsnSacRequirementForKind", () => {
  it("requires an HSN code for goods and parts", () => {
    expect(hsnSacRequirementForKind("good")).toBe("hsn");
    expect(hsnSacRequirementForKind("part")).toBe("hsn");
  });

  it("requires a SAC code for services", () => {
    expect(hsnSacRequirementForKind("service")).toBe("sac");
  });

  it("requires nothing for internal labour/expense line-item kinds", () => {
    expect(hsnSacRequirementForKind("labour")).toBe("not_applicable");
    expect(hsnSacRequirementForKind("expense")).toBe("not_applicable");
  });
});

describe("classifyHsnSacCode", () => {
  it("classifies a 6-digit code starting with 99 as SAC", () => {
    expect(classifyHsnSacCode("998314")).toBe("sac");
  });

  it("classifies valid HSN digit lengths (2/4/6/8) as HSN", () => {
    expect(classifyHsnSacCode("84")).toBe("hsn");
    expect(classifyHsnSacCode("8471")).toBe("hsn");
    expect(classifyHsnSacCode("847130")).toBe("hsn");
    expect(classifyHsnSacCode("84713010")).toBe("hsn");
  });

  it("classifies a 6-digit code as HSN (not SAC) when it doesn't start with 99", () => {
    expect(classifyHsnSacCode("847130")).toBe("hsn");
  });

  it("returns null for non-numeric input", () => {
    expect(classifyHsnSacCode("ABCD")).toBeNull();
  });

  it("returns null for a numeric string of an unrecognized length", () => {
    expect(classifyHsnSacCode("123")).toBeNull();
    expect(classifyHsnSacCode("1234567")).toBeNull();
  });

  it("tolerates surrounding whitespace", () => {
    expect(classifyHsnSacCode("  8471 ")).toBe("hsn");
  });
});

describe("validateHsnSacCode", () => {
  it("is always valid=not_applicable for labour/expense regardless of code presence", () => {
    expect(validateHsnSacCode("labour", null)).toEqual({ requirement: "not_applicable", status: "not_applicable" });
    expect(validateHsnSacCode("expense", "998314")).toEqual({ requirement: "not_applicable", status: "not_applicable" });
  });

  it("flags a missing HSN code on a good", () => {
    const result = validateHsnSacCode("good", null);
    expect(result.requirement).toBe("hsn");
    expect(result.status).toBe("missing");
  });

  it("flags a missing SAC code on a service", () => {
    const result = validateHsnSacCode("service", "  ");
    expect(result.requirement).toBe("sac");
    expect(result.status).toBe("missing");
  });

  it("accepts a well-formed HSN code on a good/part", () => {
    expect(validateHsnSacCode("good", "8471")).toEqual({ requirement: "hsn", status: "valid" });
    expect(validateHsnSacCode("part", "84713010")).toEqual({ requirement: "hsn", status: "valid" });
  });

  it("accepts a well-formed SAC code on a service", () => {
    expect(validateHsnSacCode("service", "998314")).toEqual({ requirement: "sac", status: "valid" });
  });

  it("rejects non-digit characters", () => {
    const result = validateHsnSacCode("good", "84X1");
    expect(result.status).toBe("invalid");
    expect(result.reason).toMatch(/digits only/);
  });

  it("rejects a SAC-shaped code on a goods item with a helpful reason", () => {
    const result = validateHsnSacCode("good", "998314");
    expect(result.status).toBe("invalid");
    expect(result.reason).toMatch(/Services Accounting Code/);
  });

  it("rejects an HSN-shaped code on a service item", () => {
    const result = validateHsnSacCode("service", "8471");
    expect(result.status).toBe("invalid");
    expect(result.reason).toMatch(/6-digit Services Accounting Code/);
  });

  it("rejects an unrecognized HSN digit length with a plain reason", () => {
    const result = validateHsnSacCode("good", "123");
    expect(result.status).toBe("invalid");
    expect(result.reason).toMatch(/2, 4, 6 or 8 digits/);
  });
});

describe("validateItemHsnSac", () => {
  it("delegates to validateHsnSacCode using the item's own kind/hsnCode", () => {
    expect(validateItemHsnSac({ kind: "good", hsnCode: "8471" })).toEqual({ requirement: "hsn", status: "valid" });
    expect(validateItemHsnSac({ kind: "service", hsnCode: null })).toEqual({
      requirement: "sac",
      status: "missing",
      reason: "No SAC code set for this service.",
    });
  });
});
