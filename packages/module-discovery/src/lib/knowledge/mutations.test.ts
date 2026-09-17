/**
 * Knowledge sources feed the product profile, so what matters is that every source is
 * bounded (a 15K content cap keeps one huge paste from dominating every future prompt)
 * and that a file whose text cannot be extracted is still attached rather than rejected —
 * the founder keeps the reference, the AI just gets a placeholder.
 *
 * The storage path is prefixed with the workspace id, which is what the bucket's RLS
 * policy checks, so its shape is a security property.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeSupabase, eqFilters, usedOp, writtenRow, type QueryResult, type RecordedStorage } from "@cofounderai/core/test-support/fake-supabase";

const h = vi.hoisted(() => ({
  createClient: vi.fn(),
  pdfParse: vi.fn(),
  extractRawText: vi.fn(),
}));

vi.mock("../../db/server", () => ({ createClient: h.createClient }));
vi.mock("pdf-parse", () => ({ default: h.pdfParse }));
vi.mock("mammoth", () => ({ extractRawText: h.extractRawText }));

const {
  addFileKnowledgeSource,
  addKnowledgeSource,
  deleteKnowledgeSource,
  updateKnowledgeSource,
} = await import("./mutations");

const WORKSPACE = "w1";

function mock(options: { query?: () => QueryResult; storage?: (c: RecordedStorage) => QueryResult } = {}) {
  const supabase = createFakeSupabase({
    query: options.query ?? (() => ({ data: { id: "k1" }, error: null })),
    storage: options.storage ?? (() => ({ data: { path: "p" }, error: null })),
  });
  h.createClient.mockResolvedValue(supabase);
  return supabase;
}

function file(name: string, type: string, content = "x") {
  return new File([content], name, { type });
}

beforeEach(() => vi.clearAllMocks());

describe("addKnowledgeSource", () => {
  it("trims content and defaults the name to the source type", async () => {
    const supabase = mock();

    await addKnowledgeSource(WORKSPACE, { sourceType: "manual", sourceName: "  ", content: "  hello  " });

    expect(writtenRow(supabase.queries("product_knowledge")[0]!)).toEqual({
      workspace_id: WORKSPACE,
      source_type: "manual",
      source_name: "manual",
      content: "hello",
    });
  });

  it("caps content at 15K characters", async () => {
    const supabase = mock();

    await addKnowledgeSource(WORKSPACE, { sourceType: "manual", sourceName: "big", content: "a".repeat(20_000) });

    expect(String(writtenRow(supabase.queries("product_knowledge")[0]!)!.content)).toHaveLength(15_000);
  });

  it.each([["empty content", ""], ["whitespace-only content", "   "]])(
    "rejects %s before writing",
    async (_label, content) => {
      const supabase = mock();

      await expect(
        addKnowledgeSource(WORKSPACE, { sourceType: "manual", sourceName: "n", content }),
      ).rejects.toThrow("Content is required.");
      expect(supabase.queries()).toEqual([]);
    },
  );

  it("propagates a failure", async () => {
    mock({ query: () => ({ data: null, error: new Error("denied") }) });

    await expect(
      addKnowledgeSource(WORKSPACE, { sourceType: "manual", sourceName: "n", content: "c" }),
    ).rejects.toThrow("denied");
  });
});

describe("updateKnowledgeSource / deleteKnowledgeSource", () => {
  it("updates the one source, trimmed and capped", async () => {
    const supabase = mock();

    await updateKnowledgeSource("k1", "  new text  ");

    const call = supabase.queries("product_knowledge")[0]!;
    expect(writtenRow(call)).toEqual({ content: "new text" });
    expect(eqFilters(call)).toEqual({ id: "k1" });
  });

  it("rejects clearing a source to empty", async () => {
    mock();
    await expect(updateKnowledgeSource("k1", "   ")).rejects.toThrow("Content is required.");
  });

  it("deletes the one source", async () => {
    const supabase = mock();

    await deleteKnowledgeSource("k1");

    const call = supabase.queries("product_knowledge")[0]!;
    expect(usedOp(call, "delete")).toBe(true);
    expect(eqFilters(call)).toEqual({ id: "k1" });
  });

  it.each([
    ["updateKnowledgeSource", () => updateKnowledgeSource("k1", "c")],
    ["deleteKnowledgeSource", () => deleteKnowledgeSource("k1")],
  ])("%s propagates a failure", async (_label, run) => {
    mock({ query: () => ({ data: null, error: new Error("denied") }) });
    await expect(run()).rejects.toThrow("denied");
  });
});

describe("addFileKnowledgeSource — guards and storage", () => {
  it("rejects an empty file", async () => {
    const supabase = mock();

    await expect(addFileKnowledgeSource(WORKSPACE, file("x.txt", "text/plain", ""))).rejects.toThrow(
      "File is empty.",
    );
    expect(supabase.storageCalls()).toEqual([]);
  });

  it("rejects a file over 20MB", async () => {
    const supabase = mock();
    const big = new File([new Uint8Array(20 * 1024 * 1024 + 1)], "big.pdf", { type: "application/pdf" });

    await expect(addFileKnowledgeSource(WORKSPACE, big)).rejects.toThrow("File must be 20MB or smaller.");
    expect(supabase.storageCalls()).toEqual([]);
  });

  it("prefixes the storage path with the workspace id, as the bucket policy requires", async () => {
    const supabase = mock();

    await addFileKnowledgeSource(WORKSPACE, file("spec.txt", "text/plain", "contents"));

    const [path] = supabase.storageCalls("upload")[0]!.args as [string];
    expect(path.split("/")[0]).toBe(WORKSPACE);
    expect(supabase.storageCalls("upload")[0]!.bucket).toBe("knowledge-files");
  });

  it("sanitizes the filename in the stored path", async () => {
    const supabase = mock();

    await addFileKnowledgeSource(WORKSPACE, file("my spec (final)!.txt", "text/plain", "c"));

    const path = supabase.storageCalls("upload")[0]!.args[0] as string;
    expect(path).toMatch(/my_spec__final__\.txt$/);
  });

  it("records the original filename on the row, not the sanitized one", async () => {
    const supabase = mock();

    await addFileKnowledgeSource(WORKSPACE, file("my spec.txt", "text/plain", "c"));

    expect(writtenRow(supabase.queries("product_knowledge")[0]!)).toMatchObject({
      source_name: "my spec.txt",
    });
  });

  it("does not record a source when the upload failed", async () => {
    const supabase = mock({ storage: () => ({ data: null, error: new Error("upload denied") }) });

    await expect(addFileKnowledgeSource(WORKSPACE, file("x.txt", "text/plain", "c"))).rejects.toThrow(
      "upload denied",
    );
    expect(supabase.queries("product_knowledge")).toEqual([]);
  });

  it("records the storage path and mime type as metadata", async () => {
    const supabase = mock();

    await addFileKnowledgeSource(WORKSPACE, file("x.txt", "text/plain", "hello"));

    const uploadedPath = supabase.storageCalls("upload")[0]!.args[0];
    expect(writtenRow(supabase.queries("product_knowledge")[0]!)!.metadata).toMatchObject({
      storage_path: uploadedPath,
      mime_type: "text/plain",
    });
  });
});

describe("addFileKnowledgeSource — text extraction", () => {
  it("extracts PDF text", async () => {
    h.pdfParse.mockResolvedValue({ text: "  pdf contents  " });
    const supabase = mock();

    await addFileKnowledgeSource(WORKSPACE, file("spec.pdf", "application/pdf", "raw"));

    expect(writtenRow(supabase.queries("product_knowledge")[0]!)).toMatchObject({ content: "pdf contents" });
  });

  it("extracts DOCX text", async () => {
    h.extractRawText.mockResolvedValue({ value: "docx contents" });
    const supabase = mock();

    await addFileKnowledgeSource(
      WORKSPACE,
      file("spec.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "raw"),
    );

    expect(writtenRow(supabase.queries("product_knowledge")[0]!)).toMatchObject({ content: "docx contents" });
  });

  it("recognizes a PDF by extension even when the browser sent no type", async () => {
    h.pdfParse.mockResolvedValue({ text: "pdf contents" });
    mock();

    await addFileKnowledgeSource(WORKSPACE, file("spec.PDF", "", "raw"));

    expect(h.pdfParse).toHaveBeenCalled();
  });

  it.each([
    ["a text/* type", "notes.log", "text/plain"],
    [".txt", "notes.txt", ""],
    [".md", "notes.md", ""],
  ])("reads %s directly", async (_label, name, type) => {
    const supabase = mock();

    await addFileKnowledgeSource(WORKSPACE, file(name, type, "plain contents"));

    expect(writtenRow(supabase.queries("product_knowledge")[0]!)).toMatchObject({
      content: "plain contents",
    });
  });

  it("caps extracted text at 15K characters", async () => {
    h.pdfParse.mockResolvedValue({ text: "a".repeat(20_000) });
    const supabase = mock();

    await addFileKnowledgeSource(WORKSPACE, file("big.pdf", "application/pdf", "raw"));

    expect(String(writtenRow(supabase.queries("product_knowledge")[0]!)!.content)).toHaveLength(15_000);
  });

  it("attaches an image with a placeholder rather than rejecting it", async () => {
    const supabase = mock();

    await addFileKnowledgeSource(WORKSPACE, file("logo.png", "image/png", "binary"));

    expect(String(writtenRow(supabase.queries("product_knowledge")[0]!)!.content)).toContain(
      "no text could be extracted",
    );
  });

  it("falls back to the placeholder when extraction throws on a corrupt file", async () => {
    h.pdfParse.mockRejectedValue(new Error("invalid PDF structure"));
    const supabase = mock();

    await addFileKnowledgeSource(WORKSPACE, file("broken.pdf", "application/pdf", "raw"));

    expect(String(writtenRow(supabase.queries("product_knowledge")[0]!)!.content)).toContain(
      "no text could be extracted",
    );
  });

  it("falls back to the placeholder when extraction yields only whitespace", async () => {
    h.pdfParse.mockResolvedValue({ text: "   " });
    const supabase = mock();

    await addFileKnowledgeSource(WORKSPACE, file("blank.pdf", "application/pdf", "raw"));

    expect(String(writtenRow(supabase.queries("product_knowledge")[0]!)!.content)).toContain(
      "no text could be extracted",
    );
  });
});

describe("addFileKnowledgeSource — remaining fallbacks", () => {
  it("falls back to the placeholder when a DOCX holds only whitespace", async () => {
    h.extractRawText.mockResolvedValue({ value: "   " });
    const supabase = mock();

    await addFileKnowledgeSource(
      WORKSPACE,
      file("empty.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "raw"),
    );

    expect(String(writtenRow(supabase.queries("product_knowledge")[0]!)!.content)).toContain(
      "no text could be extracted",
    );
  });

  it("falls back to the placeholder for a text file holding only whitespace", async () => {
    const supabase = mock();

    await addFileKnowledgeSource(WORKSPACE, file("blank.txt", "text/plain", "   "));

    expect(String(writtenRow(supabase.queries("product_knowledge")[0]!)!.content)).toContain(
      "no text could be extracted",
    );
  });

  it("names the placeholder generically when the browser sent no type", async () => {
    const supabase = mock();

    await addFileKnowledgeSource(WORKSPACE, file("mystery.bin", "", "binary"));

    expect(writtenRow(supabase.queries("product_knowledge")[0]!)!.content).toBe(
      "[file attachment -- no text could be extracted for AI context]",
    );
  });

  it("propagates a failure to record the uploaded file", async () => {
    mock({ query: () => ({ data: null, error: new Error("insert denied") }) });

    await expect(
      addFileKnowledgeSource(WORKSPACE, file("notes.txt", "text/plain", "hi")),
    ).rejects.toThrow("insert denied");
  });
});
