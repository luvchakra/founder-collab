import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { randomBytes } from "node:crypto";
import { buildCancelPayload, buildIrnUrl, buildSubmitPayload, createGspIrpAdapter, parseSubmitResponse } from "./gsp-adapter";
import type { GspCredentials } from "../gsp-client";

beforeAll(() => {
  process.env.API_KEY_ENCRYPTION_SECRET = randomBytes(32).toString("base64");
});

describe("buildSubmitPayload", () => {
  it("maps the generic submit request into the real NIC DocDtls/ValDtls shape", () => {
    expect(
      buildSubmitPayload({
        docNumber: "INV-0001",
        docDate: "12-09-2026",
        assessableValue: 1000,
        cgstValue: 90,
        sgstValue: 90,
        igstValue: 0,
        totalValue: 1180,
      }),
    ).toEqual({
      DocDtls: { No: "INV-0001", Dt: "12-09-2026" },
      ValDtls: { AssVal: 1000, CgstVal: 90, SgstVal: 90, IgstVal: 0, TotInvVal: 1180 },
    });
  });
});

describe("parseSubmitResponse", () => {
  it("normalizes the real IRP response fields", () => {
    expect(parseSubmitResponse({ Irn: "irn-1", AckNo: "ack-1", AckDt: "2026-09-12", SignedQRCode: "qr-data" })).toEqual({
      irn: "irn-1",
      ackNo: "ack-1",
      ackDate: "2026-09-12",
      qrCode: "qr-data",
    });
  });

  it("defaults every field to null when the response has none of them", () => {
    expect(parseSubmitResponse({})).toEqual({ irn: null, ackNo: null, ackDate: null, qrCode: null });
  });
});

describe("buildCancelPayload", () => {
  it("maps the generic cancel request into the real Irn/CnlRsn/CnlRem shape", () => {
    expect(buildCancelPayload({ irn: "irn-1", reasonCode: "1", remarks: "Duplicate" })).toEqual({
      Irn: "irn-1",
      CnlRsn: "1",
      CnlRem: "Duplicate",
    });
  });
});

describe("buildIrnUrl", () => {
  it("appends the IRN as a path segment", () => {
    expect(buildIrnUrl("https://gsp.example.com/eicore/v1.03/Invoice/irn", "irn-abc-123")).toBe(
      "https://gsp.example.com/eicore/v1.03/Invoice/irn/irn-abc-123",
    );
  });

  it("does not produce a double slash when the base already ends in one", () => {
    expect(buildIrnUrl("https://gsp.example.com/irn/", "irn-abc-123")).toBe("https://gsp.example.com/irn/irn-abc-123");
  });

  it("URL-encodes the IRN", () => {
    expect(buildIrnUrl("https://gsp.example.com/irn", "a/b c")).toBe("https://gsp.example.com/irn/a%2Fb%20c");
  });
});

const CREDENTIALS: GspCredentials = { gsp_username: null, gsp_password: null, client_id: "id", client_secret: "secret" };

describe("createGspIrpAdapter", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("submit() posts to generateUrl and returns the normalized response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ Irn: "irn-1" }) }));
    const adapter = createGspIrpAdapter(
      { generateUrl: "https://gsp.example.com/generate", cancelUrl: "https://gsp.example.com/cancel", statusUrl: null, fetchUrl: null },
      CREDENTIALS,
    );
    await expect(
      adapter.submit({ docNumber: "INV-1", docDate: "12-09-2026", assessableValue: 100, cgstValue: 0, sgstValue: 0, igstValue: 18, totalValue: 118 }),
    ).resolves.toEqual({ irn: "irn-1", ackNo: null, ackDate: null, qrCode: null });
  });

  it("cancel() posts to cancelUrl", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    vi.stubGlobal("fetch", fetchMock);
    const adapter = createGspIrpAdapter(
      { generateUrl: "https://gsp.example.com/generate", cancelUrl: "https://gsp.example.com/cancel", statusUrl: null, fetchUrl: null },
      CREDENTIALS,
    );
    await adapter.cancel({ irn: "irn-1", reasonCode: "1", remarks: "test" });
    expect(fetchMock).toHaveBeenCalledWith("https://gsp.example.com/cancel", expect.objectContaining({ method: "POST" }));
  });

  it("status() throws a clear error when no status URL is configured", async () => {
    const adapter = createGspIrpAdapter(
      { generateUrl: "https://gsp.example.com/generate", cancelUrl: "https://gsp.example.com/cancel", statusUrl: null, fetchUrl: null },
      CREDENTIALS,
    );
    await expect(adapter.status({ irn: "irn-1" })).rejects.toThrow("No status URL is configured");
  });

  it("status() GETs the IRN-suffixed status URL and returns the normalized + raw fields", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ Irn: "irn-1", Status: "ACT", EwbNo: null }) }));
    const adapter = createGspIrpAdapter(
      {
        generateUrl: "https://gsp.example.com/generate",
        cancelUrl: "https://gsp.example.com/cancel",
        statusUrl: "https://gsp.example.com/irn",
        fetchUrl: null,
      },
      CREDENTIALS,
    );
    await expect(adapter.status({ irn: "irn-1" })).resolves.toEqual({ Irn: "irn-1", Status: "ACT", EwbNo: null, irn: "irn-1", status: "ACT" });
  });

  it("fetch() throws a clear error when no fetch URL is configured", async () => {
    const adapter = createGspIrpAdapter(
      { generateUrl: "https://gsp.example.com/generate", cancelUrl: "https://gsp.example.com/cancel", statusUrl: null, fetchUrl: null },
      CREDENTIALS,
    );
    await expect(adapter.fetch({ irn: "irn-1" })).rejects.toThrow("No fetch URL is configured");
  });

  it("fetch() GETs the IRN-suffixed fetch URL and returns the raw response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ Irn: "irn-1", DocDtls: { No: "INV-1" } }) }));
    const adapter = createGspIrpAdapter(
      {
        generateUrl: "https://gsp.example.com/generate",
        cancelUrl: "https://gsp.example.com/cancel",
        statusUrl: null,
        fetchUrl: "https://gsp.example.com/fetch",
      },
      CREDENTIALS,
    );
    await expect(adapter.fetch({ irn: "irn-1" })).resolves.toEqual({ Irn: "irn-1", DocDtls: { No: "INV-1" } });
  });
});
