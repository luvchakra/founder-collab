import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { randomBytes } from "node:crypto";
import { buildGstr2bFetchUrl, createGspGstr2bFetchAdapter } from "./gsp-adapter";
import type { GspCredentials } from "../gsp-client";

beforeAll(() => {
  process.env.API_KEY_ENCRYPTION_SECRET = randomBytes(32).toString("base64");
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const credentials: GspCredentials = { gsp_username: null, gsp_password: null, client_id: "client-1", client_secret: "secret-1" };

describe("buildGstr2bFetchUrl", () => {
  it("converts YYYY-MM into GSTN's own MMYYYY query convention", () => {
    expect(buildGstr2bFetchUrl("https://gsp.example.com/gstr2b", "2026-09")).toBe("https://gsp.example.com/gstr2b?ret_period=092026");
  });

  it("appends with & when the base URL already has a query string", () => {
    expect(buildGstr2bFetchUrl("https://gsp.example.com/gstr2b?gstin=X", "2027-01")).toBe("https://gsp.example.com/gstr2b?gstin=X&ret_period=012027");
  });

  it("throws for an invalid return period rather than sending a malformed request", () => {
    expect(() => buildGstr2bFetchUrl("https://gsp.example.com/gstr2b", "not-a-period")).toThrow(/not a valid return period/);
  });
});

describe("createGspGstr2bFetchAdapter", () => {
  it("fetches the configured URL with the period appended and returns the raw JSON", async () => {
    const raw = { gstin: "27AAAAA0000A1Z5", fp: "092026", docdata: { b2b: [] } };
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => raw });
    vi.stubGlobal("fetch", fetchMock);

    const adapter = createGspGstr2bFetchAdapter("https://gsp.example.com/gstr2b", credentials);
    const result = await adapter.fetch("2026-09");

    expect(result).toEqual(raw);
    expect(fetchMock).toHaveBeenCalledWith("https://gsp.example.com/gstr2b?ret_period=092026", expect.objectContaining({ method: "GET" }));
  });

  it("rejects an invalid return period before making any request", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const adapter = createGspGstr2bFetchAdapter("https://gsp.example.com/gstr2b", credentials);
    await expect(adapter.fetch("garbage")).rejects.toThrow(/not a valid return period/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
