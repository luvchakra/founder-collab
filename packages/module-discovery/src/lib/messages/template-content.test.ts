import { describe, expect, it } from "vitest";
import { formatTemplateContent, parseTemplateContent } from "./template-content";

describe("formatTemplateContent / parseTemplateContent", () => {
  it("round-trips a variables map through its text form", () => {
    const variables = { FIRST_NAME: "Priya", COMPANY: "Acme", SEATS: "42" };
    const text = formatTemplateContent(variables);
    expect(parseTemplateContent(text)).toEqual(variables);
  });

  it("drops lines with no colon rather than failing", () => {
    const text = "FIRST_NAME: Priya\njust a stray note\nCOMPANY: Acme";
    expect(parseTemplateContent(text)).toEqual({ FIRST_NAME: "Priya", COMPANY: "Acme" });
  });

  it("trims whitespace around keys and values", () => {
    expect(parseTemplateContent("  FIRST_NAME  :   Priya  ")).toEqual({ FIRST_NAME: "Priya" });
  });

  it("preserves a colon inside the value itself", () => {
    expect(parseTemplateContent("CTA: Book a call: 10am-11am")).toEqual({
      CTA: "Book a call: 10am-11am",
    });
  });
});
