import { describe, expect, it } from "vitest";
import { fetchAllRows } from "./fetch-all";

// §37: chunked, deterministic paging past PostgREST's max-rows cap.
describe("fetchAllRows", () => {
  const source = Array.from({ length: 2503 }, (_, i) => ({ id: i }));
  const page = (from: number, to: number) => Promise.resolve({ data: source.slice(from, to + 1), error: null });

  it("returns every row across chunks, in order, without duplicates", async () => {
    const rows = await fetchAllRows(page, { chunkSize: 1000 });
    expect(rows).toHaveLength(2503);
    expect(rows[1000]).toEqual({ id: 1000 });
    expect(new Set(rows.map((r) => r.id)).size).toBe(2503);
  });

  it("stops after an exactly-full last chunk with one empty request", async () => {
    const exact = Array.from({ length: 2000 }, (_, i) => ({ id: i }));
    const calls: number[] = [];
    const rows = await fetchAllRows((from, to) => {
      calls.push(from);
      return Promise.resolve({ data: exact.slice(from, to + 1), error: null });
    });
    expect(rows).toHaveLength(2000);
    expect(calls).toEqual([0, 1000, 2000]);
  });

  it("surfaces a query error rather than returning a partial file", async () => {
    await expect(fetchAllRows(() => Promise.resolve({ data: null, error: new Error("boom") }))).rejects.toThrow("boom");
  });
});
