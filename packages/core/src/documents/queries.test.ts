import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeSupabase, eqFilters, opArgs } from "../test-support/fake-supabase";

const { createClient } = vi.hoisted(() => ({ createClient: vi.fn() }));
vi.mock("../db/server", () => ({ createClient }));

const { getDocument, listDocumentLines, listDocumentsForBusiness } = await import("./queries");

const BUSINESS = "b0000000-0000-0000-0000-000000000001";

function mock(data: unknown, error: unknown = null) {
  const supabase = createFakeSupabase({ query: () => ({ data, error }) });
  createClient.mockResolvedValue(supabase);
  return supabase;
}

beforeEach(() => vi.clearAllMocks());

describe("listDocumentsForBusiness", () => {
  it("lists a business's documents newest first", async () => {
    const supabase = mock([]);

    await listDocumentsForBusiness(BUSINESS);

    const call = supabase.queries("documents")[0]!;
    expect(eqFilters(call)).toEqual({ business_id: BUSINESS });
    expect(opArgs(call, "order")).toEqual(["doc_date", { ascending: false }]);
  });

  it("narrows to one document type when asked", async () => {
    const supabase = mock([]);

    await listDocumentsForBusiness(BUSINESS, "invoice");

    expect(eqFilters(supabase.queries("documents")[0]!)).toEqual({
      business_id: BUSINESS,
      doc_type: "invoice",
    });
  });

  it("does not filter by type when none is given", async () => {
    const supabase = mock([]);

    await listDocumentsForBusiness(BUSINESS);

    expect(eqFilters(supabase.queries("documents")[0]!)).not.toHaveProperty("doc_type");
  });
});

describe("getDocument", () => {
  it("returns null for a document the caller cannot see", async () => {
    mock(null);
    await expect(getDocument("doc-1")).resolves.toBeNull();
  });
});

describe("listDocumentLines", () => {
  it("returns a document's lines in their stored sort order", async () => {
    const supabase = mock([]);

    await listDocumentLines("doc-1");

    const call = supabase.queries("document_lines")[0]!;
    expect(eqFilters(call)).toEqual({ document_id: "doc-1" });
    expect(opArgs(call, "order")).toEqual(["sort_order"]);
  });
});

describe("failures", () => {
  it.each([
    ["listDocumentsForBusiness", () => listDocumentsForBusiness(BUSINESS)],
    ["getDocument", () => getDocument("doc-1")],
    ["listDocumentLines", () => listDocumentLines("doc-1")],
  ])("%s propagates", async (_label, run) => {
    mock(null, new Error("denied"));
    await expect(run()).rejects.toThrow("denied");
  });
});
