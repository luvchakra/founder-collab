/**
 * Contacts mirror one-way into `core.party_contacts` at creation (D-3). The docstring is
 * explicit that updates and deletes are *not* propagated — there is no stored link back
 * to the mirrored row — so this tests that the mirror happens once and only once, and
 * that a prospect with no resolvable business skips it rather than failing the create the
 * founder actually asked for.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeSupabase, eqFilters, usedOp, writtenRow } from "@cofounderai/core/test-support/fake-supabase";

const h = vi.hoisted(() => ({
  createClient: vi.fn(),
  addPartyContact: vi.fn(),
  ensureProspectParty: vi.fn(),
  getProspect: vi.fn(),
  getBusinessIdForWorkspace: vi.fn(),
}));

vi.mock("../../db/server", () => ({ createClient: h.createClient }));
vi.mock("@cofounderai/core/parties/mutations", () => ({ addPartyContact: h.addPartyContact }));
vi.mock("../prospects/party-sync", () => ({ ensureProspectParty: h.ensureProspectParty }));
vi.mock("../prospects/queries", () => ({ getProspect: h.getProspect }));
vi.mock("../tenancy/queries", () => ({ getBusinessIdForWorkspace: h.getBusinessIdForWorkspace }));

const { createContact, deleteContact, updateContact } = await import("./mutations");

const INPUT = { firstName: "  Ada  ", lastName: "Lovelace", email: " ada@acme.com " };

function mock(data: unknown = { id: "c1" }, error: unknown = null) {
  const supabase = createFakeSupabase({ query: () => ({ data, error }) });
  h.createClient.mockResolvedValue(supabase);
  return supabase;
}

beforeEach(() => {
  vi.clearAllMocks();
  h.getProspect.mockResolvedValue({ id: "p1", party_id: "party-1", company_name: "Acme", company_email: null });
  h.getBusinessIdForWorkspace.mockResolvedValue("biz-1");
  h.ensureProspectParty.mockResolvedValue("party-1");
});

describe("createContact", () => {
  it("trims every field and nulls the blanks", async () => {
    const supabase = mock();

    await createContact("w1", "p1", { ...INPUT, jobTitle: "  " });

    expect(writtenRow(supabase.queries("contacts")[0]!)).toEqual({
      workspace_id: "w1",
      prospect_id: "p1",
      first_name: "Ada",
      last_name: "Lovelace",
      job_title: null,
      email: "ada@acme.com",
      linkedin_url: null,
      phone: null,
    });
  });

  it("nulls every field a caller left out entirely", async () => {
    const supabase = mock();

    await createContact("w1", "p1", { phone: "+91 99999 99999" });

    expect(writtenRow(supabase.queries("contacts")[0]!)).toEqual({
      workspace_id: "w1",
      prospect_id: "p1",
      first_name: null,
      last_name: null,
      job_title: null,
      email: null,
      linkedin_url: null,
      phone: "+91 99999 99999",
    });
  });

  it("mirrors the contact onto the prospect's party", async () => {
    mock();

    await createContact("w1", "p1", INPUT);

    expect(h.ensureProspectParty).toHaveBeenCalledWith("w1", "party-1", {
      name: "Acme",
      email: null,
    });
    expect(h.addPartyContact).toHaveBeenCalledWith(
      expect.objectContaining({ businessId: "biz-1", partyId: "party-1", firstName: "  Ada  " }),
    );
  });

  it("still creates the contact when the prospect is not visible, skipping the mirror", async () => {
    const supabase = mock();
    h.getProspect.mockResolvedValue(null);

    await expect(createContact("w1", "p1", INPUT)).resolves.toMatchObject({ id: "c1" });

    expect(h.addPartyContact).not.toHaveBeenCalled();
    expect(supabase.queries("contacts")).toHaveLength(1);
  });

  it("skips the mirror when the workspace resolves to no business", async () => {
    mock();
    h.getBusinessIdForWorkspace.mockResolvedValue(null);

    await expect(createContact("w1", "p1", INPUT)).resolves.toMatchObject({ id: "c1" });
    expect(h.addPartyContact).not.toHaveBeenCalled();
  });

  it("propagates a failed insert without mirroring anything", async () => {
    mock(null, new Error("denied"));

    await expect(createContact("w1", "p1", INPUT)).rejects.toThrow("denied");
    expect(h.addPartyContact).not.toHaveBeenCalled();
  });
});

describe("updateContact", () => {
  it("updates the one contact and does NOT re-mirror — the snapshot is one-way", async () => {
    const supabase = mock();

    await updateContact("c1", { firstName: " Ada ", email: "" });

    const call = supabase.queries("contacts")[0]!;
    expect(writtenRow(call)).toMatchObject({ first_name: "Ada", email: null });
    expect(eqFilters(call)).toEqual({ id: "c1" });
    expect(h.addPartyContact).not.toHaveBeenCalled();
  });

  it("propagates a failure", async () => {
    mock(null, new Error("denied"));
    await expect(updateContact("c1", { firstName: "A" })).rejects.toThrow("denied");
  });
});

describe("deleteContact", () => {
  it("deletes the one contact, leaving the mirrored party contact alone", async () => {
    const supabase = mock();

    await deleteContact("c1");

    const call = supabase.queries("contacts")[0]!;
    expect(usedOp(call, "delete")).toBe(true);
    expect(eqFilters(call)).toEqual({ id: "c1" });
  });

  it("propagates a failure", async () => {
    mock(null, new Error("denied"));
    await expect(deleteContact("c1")).rejects.toThrow("denied");
  });
});
