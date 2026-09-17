/**
 * The bridge between `discovery` (workspace-tenanted) and `core.parties`
 * (business-tenanted) — 00-MASTER-PLAN.md §5's "winning a prospect adds the customer
 * role; it does not copy a record". Two invariants matter: an existing link is never
 * re-created (which would fork the identity the party model exists to unify), and a
 * workspace with no resolvable business fails loudly rather than writing a party into
 * the wrong tenant.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { getBusinessIdForWorkspace } = vi.hoisted(() => ({ getBusinessIdForWorkspace: vi.fn() }));
const { addPartyRole, createParty } = vi.hoisted(() => ({
  addPartyRole: vi.fn(),
  createParty: vi.fn(),
}));

vi.mock("../tenancy/queries", () => ({ getBusinessIdForWorkspace }));
vi.mock("@cofounderai/core/parties/mutations", () => ({ addPartyRole, createParty }));

const { ensureProspectParty, markProspectPartyWon } = await import("./party-sync");

const WORKSPACE = "w0000000-0000-0000-0000-000000000001";
const BUSINESS = "b0000000-0000-0000-0000-000000000001";
const PARTY = "p0000000-0000-0000-0000-000000000001";

beforeEach(() => {
  vi.clearAllMocks();
  getBusinessIdForWorkspace.mockResolvedValue(BUSINESS);
  createParty.mockResolvedValue({ id: PARTY });
});

describe("ensureProspectParty", () => {
  it("creates a party in the workspace's business and grants the prospect role", async () => {
    const id = await ensureProspectParty(WORKSPACE, null, { name: "Acme", email: "a@acme.com" });

    expect(id).toBe(PARTY);
    expect(createParty).toHaveBeenCalledWith({
      businessId: BUSINESS,
      kind: "company",
      name: "Acme",
      email: "a@acme.com",
    });
    expect(addPartyRole).toHaveBeenCalledWith(BUSINESS, PARTY, "prospect");
  });

  it("normalizes a missing email to null", async () => {
    await ensureProspectParty(WORKSPACE, null, { name: "Acme" });

    expect(createParty).toHaveBeenCalledWith(expect.objectContaining({ email: null }));
  });

  it.each([
    ["an existing id", PARTY],
    ["an existing id even when undefined is the 'unset' marker elsewhere", "other-party"],
  ])("returns %s unchanged without creating anything", async (_label, existing) => {
    const id = await ensureProspectParty(WORKSPACE, existing, { name: "Acme" });

    expect(id).toBe(existing);
    expect(createParty).not.toHaveBeenCalled();
    expect(addPartyRole).not.toHaveBeenCalled();
    expect(getBusinessIdForWorkspace).not.toHaveBeenCalled();
  });

  it.each([
    ["null", null],
    ["undefined", undefined],
  ])("creates a party when the existing id is %s", async (_label, existing) => {
    await ensureProspectParty(WORKSPACE, existing, { name: "Acme" });

    expect(createParty).toHaveBeenCalled();
  });

  it("refuses to create a party when the workspace resolves to no business", async () => {
    getBusinessIdForWorkspace.mockResolvedValue(null);

    await expect(ensureProspectParty(WORKSPACE, null, { name: "Acme" })).rejects.toThrow(
      `No business found for workspace ${WORKSPACE}.`,
    );
    expect(createParty).not.toHaveBeenCalled();
  });

  it("does not grant a role if party creation fails", async () => {
    createParty.mockRejectedValue(new Error("insert denied"));

    await expect(ensureProspectParty(WORKSPACE, null, { name: "Acme" })).rejects.toThrow(
      "insert denied",
    );
    expect(addPartyRole).not.toHaveBeenCalled();
  });
});

describe("markProspectPartyWon", () => {
  it("adds the customer role to the existing party, never creating a second one", async () => {
    await markProspectPartyWon(WORKSPACE, PARTY);

    expect(addPartyRole).toHaveBeenCalledWith(BUSINESS, PARTY, "customer");
    expect(createParty).not.toHaveBeenCalled();
  });

  it("resolves the business from the workspace rather than trusting a caller-supplied one", async () => {
    await markProspectPartyWon(WORKSPACE, PARTY);

    expect(getBusinessIdForWorkspace).toHaveBeenCalledWith(WORKSPACE);
  });

  it("throws when the workspace resolves to no business", async () => {
    getBusinessIdForWorkspace.mockResolvedValue(null);

    await expect(markProspectPartyWon(WORKSPACE, PARTY)).rejects.toThrow("No business found");
    expect(addPartyRole).not.toHaveBeenCalled();
  });
});
