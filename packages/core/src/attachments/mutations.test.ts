/**
 * Attachment uploads are the one place the app writes to Storage, whose bucket policies
 * key off the FIRST path segment being one of the caller's businesses (D-8). The layout
 * of that path is therefore a security property, not a formatting detail, and the
 * ordering matters too: a metadata row written before a failed upload would point at a
 * file that does not exist.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeSupabase, eqFilters, usedOp, writtenRow, type QueryResult } from "../test-support/fake-supabase";

const { createClient } = vi.hoisted(() => ({ createClient: vi.fn() }));
vi.mock("../db/server", () => ({ createClient }));

const { deleteAttachment, uploadAttachment } = await import("./mutations");

const BUSINESS = "b0000000-0000-0000-0000-000000000001";

function mockClient(spec: {
  query?: () => QueryResult;
  storage?: () => QueryResult;
} = {}) {
  const supabase = createFakeSupabase({
    query: spec.query ?? (() => ({ data: { id: "att-1" }, error: null })),
    storage: spec.storage ?? (() => ({ data: { path: "x" }, error: null })),
  });
  createClient.mockResolvedValue(supabase);
  return supabase;
}

/** `Blob.size` is a read-only getter, so the size is produced by the content's length. */
function file(type = "application/pdf", size = 1234) {
  return new Blob([new Uint8Array(size)], { type });
}

const UPLOAD = {
  businessId: BUSINESS,
  entityType: "document",
  entityId: "doc-1",
  fileName: "invoice.pdf",
};

beforeEach(() => vi.clearAllMocks());

describe("uploadAttachment", () => {
  it("stores the file under <businessId>/<id>/<fileName>, business first", async () => {
    const supabase = mockClient();

    await uploadAttachment({ ...UPLOAD, file: file() });

    const [path] = supabase.storageCalls("upload")[0]!.args as [string];
    expect(path.split("/")[0]).toBe(BUSINESS);
    expect(path.endsWith("/invoice.pdf")).toBe(true);
    expect(path.split("/")).toHaveLength(3);
  });

  it("uploads into the attachments bucket", async () => {
    const supabase = mockClient();

    await uploadAttachment({ ...UPLOAD, file: file() });

    expect(supabase.storageCalls("upload")[0]!.bucket).toBe("attachments");
  });

  it("gives each upload its own directory segment, so identical names cannot collide", async () => {
    const first = mockClient();
    await uploadAttachment({ ...UPLOAD, file: file() });
    const second = mockClient();
    await uploadAttachment({ ...UPLOAD, file: file() });

    const pathOf = (s: typeof first) => (s.storageCalls("upload")[0]!.args[0] as string);
    expect(pathOf(first)).not.toBe(pathOf(second));
  });

  it("records metadata whose storage_path matches what was actually uploaded", async () => {
    const supabase = mockClient();

    await uploadAttachment({ ...UPLOAD, file: file() });

    const uploadedPath = supabase.storageCalls("upload")[0]!.args[0];
    expect(writtenRow(supabase.queries("attachments")[0]!)).toMatchObject({
      business_id: BUSINESS,
      entity_type: "document",
      entity_id: "doc-1",
      storage_path: uploadedPath,
      file_name: "invoice.pdf",
      content_type: "application/pdf",
      size_bytes: 1234,
    });
  });

  it("ties the metadata row id to the id used in the storage path", async () => {
    const supabase = mockClient();

    await uploadAttachment({ ...UPLOAD, file: file() });

    const path = supabase.storageCalls("upload")[0]!.args[0] as string;
    expect(writtenRow(supabase.queries("attachments")[0]!)!.id).toBe(path.split("/")[1]);
  });

  it("records a null content type for a blob with none", async () => {
    const supabase = mockClient();

    await uploadAttachment({ ...UPLOAD, file: file("") });

    expect(writtenRow(supabase.queries("attachments")[0]!)).toMatchObject({ content_type: null });
  });

  it("does not write a metadata row when the upload itself fails", async () => {
    const supabase = mockClient({ storage: () => ({ data: null, error: new Error("upload denied") }) });

    await expect(uploadAttachment({ ...UPLOAD, file: file() })).rejects.toThrow("upload denied");
    expect(supabase.queries("attachments")).toEqual([]);
  });

  it("propagates a failed metadata insert", async () => {
    mockClient({ query: () => ({ data: null, error: new Error("insert denied") }) });

    await expect(uploadAttachment({ ...UPLOAD, file: file() })).rejects.toThrow("insert denied");
  });
});

describe("deleteAttachment", () => {
  const stored = { data: { storage_bucket: "attachments", storage_path: `${BUSINESS}/att-1/x.pdf` }, error: null };

  it("removes the stored object before dropping the metadata row", async () => {
    const supabase = createFakeSupabase({ query: () => stored, storage: () => ({ data: null, error: null }) });
    createClient.mockResolvedValue(supabase);

    await deleteAttachment("att-1");

    const kinds = supabase.calls.map((c) => c.kind);
    expect(kinds).toEqual(["query", "storage", "query"]);
  });

  it("removes the object from the bucket recorded on the row, not a hardcoded one", async () => {
    const supabase = createFakeSupabase({
      query: () => ({ data: { storage_bucket: "legacy-bucket", storage_path: "p/q" }, error: null }),
      storage: () => ({ data: null, error: null }),
    });
    createClient.mockResolvedValue(supabase);

    await deleteAttachment("att-1");

    expect(supabase.storageCalls("remove")[0]!.bucket).toBe("legacy-bucket");
    expect(supabase.storageCalls("remove")[0]!.args[0]).toEqual(["p/q"]);
  });

  it("deletes the metadata row by id", async () => {
    const supabase = createFakeSupabase({ query: () => stored, storage: () => ({ data: null, error: null }) });
    createClient.mockResolvedValue(supabase);

    await deleteAttachment("att-1");

    expect(eqFilters(supabase.queries("attachments")[1]!)).toEqual({ id: "att-1" });
  });

  it("keeps the metadata row when the object could not be removed", async () => {
    const supabase = createFakeSupabase({
      query: () => stored,
      storage: () => ({ data: null, error: new Error("remove denied") }),
    });
    createClient.mockResolvedValue(supabase);

    await expect(deleteAttachment("att-1")).rejects.toThrow("remove denied");
    expect(supabase.queries("attachments")).toHaveLength(1); // the lookup only
  });

  it("propagates a failure to drop the metadata row, after the object is already gone", async () => {
    const supabase = createFakeSupabase({
      query: (call) =>
        usedOp(call, "delete") ? { data: null, error: new Error("delete denied") } : stored,
      storage: () => ({ data: null, error: null }),
    });
    createClient.mockResolvedValue(supabase);

    await expect(deleteAttachment("att-1")).rejects.toThrow("delete denied");
  });

  it("propagates a failed lookup without touching storage", async () => {
    const supabase = createFakeSupabase({ query: () => ({ data: null, error: new Error("not visible") }) });
    createClient.mockResolvedValue(supabase);

    await expect(deleteAttachment("att-1")).rejects.toThrow("not visible");
    expect(supabase.storageCalls()).toEqual([]);
  });
});
