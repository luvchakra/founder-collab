/**
 * `core.parties` + `core.party_roles` replace prospect/customer/supplier as separate
 * concepts — one row, many roles (CLAUDE.md architecture). The behaviour that makes that
 * model work is tested here: role assignment must be idempotent (winning the same
 * prospect twice is not an error), and `createSupplierParty` must not leave a
 * supplier-attrs row behind without the role that gives it meaning.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeSupabase, opArgs, usedOp, writtenRow, type RecordedQuery } from "../test-support/fake-supabase";

const { createClient } = vi.hoisted(() => ({ createClient: vi.fn() }));
vi.mock("../db/server", () => ({ createClient }));

const { addPartyContact, addPartyRole, createParty, createSupplierParty } = await import("./mutations");

const BUSINESS = "b0000000-0000-0000-0000-000000000001";
const PARTY = "p0000000-0000-0000-0000-000000000001";

function mockClient(responder?: (call: RecordedQuery) => { data: unknown; error: unknown }) {
  const supabase = createFakeSupabase({
    query: responder ?? (() => ({ data: { id: PARTY }, error: null })),
  });
  createClient.mockResolvedValue(supabase);
  return supabase;
}

beforeEach(() => vi.clearAllMocks());

describe("createParty", () => {
  it("defaults kind to 'company' and optional contact details to null", async () => {
    const supabase = mockClient();

    await createParty({ businessId: BUSINESS, name: "Acme" });

    expect(writtenRow(supabase.queries("parties")[0]!)).toEqual({
      business_id: BUSINESS,
      kind: "company",
      name: "Acme",
      email: null,
      phone: null,
    });
  });

  it("honours an explicit kind and contact details", async () => {
    const supabase = mockClient();

    await createParty({
      businessId: BUSINESS,
      kind: "person",
      name: "Ada",
      email: "ada@example.com",
      phone: "+91 12345",
    });

    expect(writtenRow(supabase.queries("parties")[0]!)).toMatchObject({
      kind: "person",
      email: "ada@example.com",
      phone: "+91 12345",
    });
  });

  it("runs against the core schema as the signed-in user", async () => {
    mockClient();

    await createParty({ businessId: BUSINESS, name: "Acme" });

    expect(createClient).toHaveBeenCalledWith({ schema: "core" });
  });

  it("propagates an insert failure", async () => {
    mockClient(() => ({ data: null, error: new Error("insert denied") }));

    await expect(createParty({ businessId: BUSINESS, name: "Acme" })).rejects.toThrow("insert denied");
  });
});

describe("addPartyRole", () => {
  it("upserts on (party_id, role) and ignores duplicates, so re-adding a role is a no-op", async () => {
    const supabase = mockClient();

    await addPartyRole(BUSINESS, PARTY, "customer");

    const call = supabase.queries("party_roles")[0]!;
    expect(opArgs(call, "upsert")).toEqual([
      { business_id: BUSINESS, party_id: PARTY, role: "customer" },
      { onConflict: "party_id,role", ignoreDuplicates: true },
    ]);
  });

  it("propagates a failure", async () => {
    mockClient(() => ({ data: null, error: new Error("upsert denied") }));

    await expect(addPartyRole(BUSINESS, PARTY, "customer")).rejects.toThrow("upsert denied");
  });
});

describe("addPartyContact", () => {
  it("nulls every unset optional field and defaults is_primary to false", async () => {
    const supabase = mockClient();

    await addPartyContact({ businessId: BUSINESS, partyId: PARTY });

    expect(writtenRow(supabase.queries("party_contacts")[0]!)).toEqual({
      business_id: BUSINESS,
      party_id: PARTY,
      first_name: null,
      last_name: null,
      job_title: null,
      email: null,
      phone: null,
      linkedin_url: null,
      is_primary: false,
    });
  });

  it("carries every supplied field through", async () => {
    const supabase = mockClient();

    await addPartyContact({
      businessId: BUSINESS,
      partyId: PARTY,
      firstName: "Ada",
      lastName: "Lovelace",
      jobTitle: "CTO",
      email: "ada@example.com",
      phone: "+91",
      linkedinUrl: "https://linkedin.com/in/ada",
      isPrimary: true,
    });

    expect(writtenRow(supabase.queries("party_contacts")[0]!)).toMatchObject({
      first_name: "Ada",
      last_name: "Lovelace",
      job_title: "CTO",
      linkedin_url: "https://linkedin.com/in/ada",
      is_primary: true,
    });
  });
});

describe("createSupplierParty", () => {
  it("creates the party, grants the supplier role, then writes supplier attrs — in that order", async () => {
    const supabase = mockClient();

    await createSupplierParty({ businessId: BUSINESS, name: "Supplier Co" });

    expect(supabase.queries().map((c) => c.table)).toEqual([
      "parties",
      "party_roles",
      "party_supplier_attrs",
    ]);
  });

  it("grants specifically the supplier role", async () => {
    const supabase = mockClient();

    await createSupplierParty({ businessId: BUSINESS, name: "Supplier Co" });

    expect(opArgs(supabase.queries("party_roles")[0]!, "upsert")![0]).toMatchObject({
      role: "supplier",
    });
  });

  it("applies the documented attr defaults (7-day lead time, zero rating)", async () => {
    const supabase = mockClient();

    await createSupplierParty({ businessId: BUSINESS, name: "Supplier Co" });

    expect(writtenRow(supabase.queries("party_supplier_attrs")[0]!)).toEqual({
      party_id: PARTY,
      business_id: BUSINESS,
      code: null,
      payment_terms: null,
      lead_time_days: 7,
      rating: 0,
    });
  });

  it("honours explicit attrs, including a zero lead time", async () => {
    const supabase = mockClient();

    await createSupplierParty({
      businessId: BUSINESS,
      name: "Supplier Co",
      code: "SUP-1",
      paymentTerms: "NET30",
      leadTimeDays: 0,
      rating: 5,
    });

    expect(writtenRow(supabase.queries("party_supplier_attrs")[0]!)).toMatchObject({
      code: "SUP-1",
      payment_terms: "NET30",
      lead_time_days: 0,
      rating: 5,
    });
  });

  it("creates the party as a company, whatever its contact details", async () => {
    const supabase = mockClient();

    await createSupplierParty({ businessId: BUSINESS, name: "Supplier Co", email: "s@co.com" });

    expect(writtenRow(supabase.queries("parties")[0]!)).toMatchObject({ kind: "company" });
  });

  it("does not write supplier attrs if the role grant fails", async () => {
    const supabase = mockClient((call) =>
      call.table === "party_roles"
        ? { data: null, error: new Error("role denied") }
        : { data: { id: PARTY }, error: null },
    );

    await expect(createSupplierParty({ businessId: BUSINESS, name: "Supplier Co" })).rejects.toThrow(
      "role denied",
    );
    expect(supabase.queries("party_supplier_attrs")).toEqual([]);
  });

  it("propagates a failed attrs insert", async () => {
    mockClient((call) =>
      call.table === "party_supplier_attrs"
        ? { data: null, error: new Error("attrs denied") }
        : { data: { id: PARTY }, error: null },
    );

    await expect(createSupplierParty({ businessId: BUSINESS, name: "Supplier Co" })).rejects.toThrow(
      "attrs denied",
    );
  });

  it("returns the created party", async () => {
    mockClient(() => ({ data: { id: PARTY, name: "Supplier Co" }, error: null }));

    await expect(createSupplierParty({ businessId: BUSINESS, name: "Supplier Co" })).resolves.toMatchObject(
      { id: PARTY },
    );
  });

  it("never issues a delete along the way", async () => {
    const supabase = mockClient();

    await createSupplierParty({ businessId: BUSINESS, name: "Supplier Co" });

    expect(supabase.queries().some((c) => usedOp(c, "delete"))).toBe(false);
  });
});
