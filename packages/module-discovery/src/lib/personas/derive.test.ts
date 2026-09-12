import { describe, expect, it } from "vitest";
import { deriveBuyerPersonasFromIcp } from "./derive";

describe("deriveBuyerPersonasFromIcp", () => {
  it("returns no personas for an ICP with no roles", () => {
    expect(deriveBuyerPersonasFromIcp({ roles: [] })).toEqual([]);
  });

  it("drops blank/whitespace-only role entries", () => {
    expect(deriveBuyerPersonasFromIcp({ roles: ["  ", ""] })).toEqual([]);
  });

  it("classifies an executive title as executive_buyer and marks it high priority as the first role", () => {
    const [persona] = deriveBuyerPersonasFromIcp({ roles: ["CISO"] });
    expect(persona).toMatchObject({ title: "CISO", roleInCommittee: "executive_buyer", priority: "high" });
  });

  it("classifies VP/Director titles as decision_maker", () => {
    const personas = deriveBuyerPersonasFromIcp({ roles: ["CISO", "VP Engineering", "Director of IT"] });
    expect(personas[1]).toMatchObject({ title: "VP Engineering", roleInCommittee: "decision_maker", priority: "medium" });
    expect(personas[2]).toMatchObject({ title: "Director of IT", roleInCommittee: "decision_maker", priority: "medium" });
  });

  it("classifies procurement/finance titles as budget_stakeholder", () => {
    const [persona] = deriveBuyerPersonasFromIcp({ roles: ["Procurement Manager"] });
    expect(persona).toMatchObject({ roleInCommittee: "budget_stakeholder" });
  });

  it("falls back to influencer for an unrecognized title rather than 'other'", () => {
    const [persona] = deriveBuyerPersonasFromIcp({ roles: ["Security Architect"] });
    expect(persona).toMatchObject({ roleInCommittee: "influencer" });
  });

  it("only the first role is high priority; the rest are medium", () => {
    const personas = deriveBuyerPersonasFromIcp({ roles: ["CISO", "Security Architect", "Procurement Manager"] });
    expect(personas.map((p) => p.priority)).toEqual(["high", "medium", "medium"]);
  });
});
