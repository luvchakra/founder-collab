import { describe, expect, it } from "vitest";
import { neutralizeFormula, toCsvText, toDateOnly, toText, toZonedIso } from "./format";

// EXP-PLAT-02 (§11, §52): the formula-injection guard and the value rules.
describe("neutralizeFormula", () => {
  it.each(["=SUM(A1:A2)", "+cmd", "@malicious", "=HYPERLINK(\"http://x\")", "\tcmd", "\rcmd", "-2+3", "-cmd|' /C calc'!A0"])(
    "neutralizes %j",
    (input) => {
      expect(neutralizeFormula(input)).toBe(`'${input}`);
    },
  );

  it.each(["-100", "-3.25", "plain text", "", "a=b", "100"])("leaves %j alone", (input) => {
    expect(neutralizeFormula(input)).toBe(input);
  });

  it("never touches a typed number, negative or not", () => {
    expect(toCsvText(-100, "number", "UTC")).toBe("-100");
    expect(toCsvText(-2500.5, "currency", "UTC")).toBe("-2500.5");
  });
});

describe("toText", () => {
  it("never writes undefined, null or [object Object]", () => {
    expect(toText(undefined)).toBe("");
    expect(toText(null)).toBe("");
    expect(toText({ a: 1 })).toBe('{"a":1}');
  });

  it("joins arrays predictably and skips blanks", () => {
    expect(toText(["VC", null, "Angel"])).toBe("VC; Angel");
  });

  it("writes booleans as Yes/No", () => {
    expect(toText(true)).toBe("Yes");
    expect(toCsvText(false, "boolean", "UTC")).toBe("No");
    expect(toCsvText(null, "boolean", "UTC")).toBe("");
  });
});

describe("dates (§40)", () => {
  it("keeps a plain calendar date exactly as that day", () => {
    expect(toDateOnly("2026-09-26", "America/Los_Angeles")).toBe("2026-09-26");
  });

  it("writes an instant in the business's zone with its offset", () => {
    expect(toZonedIso("2026-09-26T05:00:00Z", "Asia/Kolkata")).toBe("2026-09-26T10:30:00+05:30");
    expect(toZonedIso("2026-09-26T05:00:00Z", "UTC")).toBe("2026-09-26T05:00:00+00:00");
  });

  it("does not shift a late-evening local time onto the next UTC day", () => {
    // 23:30 in Kolkata is 18:00 UTC the same day; 02:00 in Kolkata is the previous UTC day.
    expect(toDateOnly("2026-09-25T20:30:00Z", "Asia/Kolkata")).toBe("2026-09-26");
  });

  it("leaves a blank or unparseable date blank", () => {
    expect(toCsvText(null, "date", "UTC")).toBe("");
    expect(toCsvText("not a date", "datetime", "UTC")).toBe("");
  });
});

describe("numbers (§41, §42, §46)", () => {
  it("keeps an unreported figure blank rather than zero", () => {
    expect(toCsvText(null, "currency", "UTC")).toBe("");
    expect(toCsvText("", "number", "UTC")).toBe("");
    expect(toCsvText(0, "number", "UTC")).toBe("0");
  });

  it("writes percentages as fractions", () => {
    expect(toCsvText(0.25, "percent", "UTC")).toBe("0.25");
  });
});
