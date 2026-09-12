import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { randomBytes } from "node:crypto";
import {
  buildCancelPayload,
  buildEwbNoUrl,
  buildExtendPayload,
  buildGeneratePayload,
  buildUpdateVehiclePayload,
  createGspEwayBillAdapter,
  parseExtendResponse,
  parseGenerateResponse,
} from "./gsp-adapter";
import type { GspCredentials } from "../gsp-client";

beforeAll(() => {
  process.env.API_KEY_ENCRYPTION_SECRET = randomBytes(32).toString("base64");
});

describe("buildGeneratePayload", () => {
  it("maps the generic generate request into the real docNo/docDate/totalValue shape", () => {
    expect(buildGeneratePayload({ docNumber: "INV-0001", docDate: "12-09-2026", totalValue: 1180 })).toEqual({
      docNo: "INV-0001",
      docDate: "12-09-2026",
      totalValue: 1180,
    });
  });
});

describe("parseGenerateResponse", () => {
  it("normalizes the real GSP response fields", () => {
    const raw = { ewbNo: "111000609282", validUpto: "2026-09-14T00:00:00Z", signedQRCode: "qr-data" };
    expect(parseGenerateResponse(raw)).toEqual({ ewbNo: "111000609282", validUpto: "2026-09-14T00:00:00Z", qrCode: "qr-data", raw });
  });

  it("defaults every extracted field to null when the response has none of them, but still keeps the raw response", () => {
    expect(parseGenerateResponse({})).toEqual({ ewbNo: null, validUpto: null, qrCode: null, raw: {} });
  });
});

describe("buildUpdateVehiclePayload", () => {
  it("maps the generic update-vehicle request into the real VEHEWB shape", () => {
    expect(
      buildUpdateVehiclePayload({
        ewbNo: "111000609282",
        vehicleNo: "PQR1234",
        fromPlace: "BANGALORE",
        fromState: "29",
        reasonCode: "1",
        reasonRem: "vehicle broke down",
      }),
    ).toEqual({
      ewbNo: "111000609282",
      vehicleNo: "PQR1234",
      fromPlace: "BANGALORE",
      fromState: "29",
      reasonCode: "1",
      reasonRem: "vehicle broke down",
    });
  });

  it("includes the optional transporter-document fields only when provided", () => {
    expect(
      buildUpdateVehiclePayload({
        ewbNo: "111000609282",
        vehicleNo: "PQR1234",
        fromPlace: "BANGALORE",
        fromState: "29",
        reasonCode: "1",
        reasonRem: "vehicle broke down",
        transDocNo: "1234",
        transDocDate: "12/10/2026",
        transMode: "1",
        vehicleType: "R",
      }),
    ).toEqual({
      ewbNo: "111000609282",
      vehicleNo: "PQR1234",
      fromPlace: "BANGALORE",
      fromState: "29",
      reasonCode: "1",
      reasonRem: "vehicle broke down",
      transDocNo: "1234",
      transDocDate: "12/10/2026",
      transMode: "1",
      vehicleType: "R",
    });
  });
});

describe("buildExtendPayload", () => {
  it("maps the generic extend request into the real ExtendEWB shape", () => {
    expect(
      buildExtendPayload({
        ewbNo: "111000609282",
        remainingDistance: 150,
        extnRsnCode: "1",
        extnRemarks: "Natural calamity",
      }),
    ).toEqual({ ewbNo: "111000609282", remainingDistance: 150, extnRsnCode: "1", extnRemarks: "Natural calamity" });
  });

  it("includes the optional vehicle/place/transport fields only when provided", () => {
    expect(
      buildExtendPayload({
        ewbNo: "111000609282",
        remainingDistance: 150,
        extnRsnCode: "1",
        extnRemarks: "Natural calamity",
        vehicleNo: "PQR1234",
        fromPlace: "BANGALORE",
        fromState: "29",
        fromPincode: "560001",
      }),
    ).toEqual({
      ewbNo: "111000609282",
      remainingDistance: 150,
      extnRsnCode: "1",
      extnRemarks: "Natural calamity",
      vehicleNo: "PQR1234",
      fromPlace: "BANGALORE",
      fromState: "29",
      fromPincode: "560001",
    });
  });
});

describe("parseExtendResponse", () => {
  it("normalizes the real ExtendEWB response fields", () => {
    const raw = { ewbNo: "111000609282", validUpto: "2026-09-20T00:00:00Z" };
    expect(parseExtendResponse("111000609282", raw)).toEqual({ ewbNo: "111000609282", validUpto: "2026-09-20T00:00:00Z", raw });
  });

  it("falls back to the request's own ewbNo and null validUpto when the response has neither", () => {
    expect(parseExtendResponse("111000609282", {})).toEqual({ ewbNo: "111000609282", validUpto: null, raw: {} });
  });
});

describe("buildCancelPayload", () => {
  it("maps the generic cancel request into the real ewbNo/cancelRsnCode/cancelRmrk shape", () => {
    expect(buildCancelPayload({ ewbNo: "111000609282", cancelRsnCode: "1", cancelRmrk: "Duplicate" })).toEqual({
      ewbNo: "111000609282",
      cancelRsnCode: "1",
      cancelRmrk: "Duplicate",
    });
  });
});

describe("buildEwbNoUrl", () => {
  it("appends the e-way bill number as a path segment", () => {
    expect(buildEwbNoUrl("https://gsp.example.com/ewayapi/status", "111000609282")).toBe(
      "https://gsp.example.com/ewayapi/status/111000609282",
    );
  });

  it("does not produce a double slash when the base already ends in one", () => {
    expect(buildEwbNoUrl("https://gsp.example.com/status/", "111000609282")).toBe("https://gsp.example.com/status/111000609282");
  });

  it("URL-encodes the e-way bill number", () => {
    expect(buildEwbNoUrl("https://gsp.example.com/status", "a/b c")).toBe("https://gsp.example.com/status/a%2Fb%20c");
  });
});

const CREDENTIALS: GspCredentials = { gsp_username: null, gsp_password: null, client_id: "id", client_secret: "secret" };
const BASE_URLS = {
  generateUrl: "https://gsp.example.com/generate",
  cancelUrl: "https://gsp.example.com/cancel",
  vehicleUpdateUrl: null,
  extendUrl: null,
  statusUrl: null,
};

describe("createGspEwayBillAdapter", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("generate() posts to generateUrl and returns the normalized response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ewbNo: "111000609282" }) }));
    const adapter = createGspEwayBillAdapter(BASE_URLS, CREDENTIALS);
    await expect(adapter.generate({ docNumber: "INV-1", docDate: "12-09-2026", totalValue: 1180 })).resolves.toEqual({
      ewbNo: "111000609282",
      validUpto: null,
      qrCode: null,
      raw: { ewbNo: "111000609282" },
    });
  });

  it("cancel() posts to cancelUrl", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    vi.stubGlobal("fetch", fetchMock);
    const adapter = createGspEwayBillAdapter(BASE_URLS, CREDENTIALS);
    await adapter.cancel({ ewbNo: "111000609282", cancelRsnCode: "1", cancelRmrk: "test" });
    expect(fetchMock).toHaveBeenCalledWith("https://gsp.example.com/cancel", expect.objectContaining({ method: "POST" }));
  });

  it("updateVehicle() throws a clear error when no vehicle-update URL is configured", async () => {
    const adapter = createGspEwayBillAdapter(BASE_URLS, CREDENTIALS);
    await expect(
      adapter.updateVehicle({ ewbNo: "111000609282", vehicleNo: "PQR1234", fromPlace: "BANGALORE", fromState: "29", reasonCode: "1", reasonRem: "test" }),
    ).rejects.toThrow("No vehicle-update URL is configured");
  });

  it("updateVehicle() posts to vehicleUpdateUrl and returns the ewbNo + raw response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ewbNo: "111000609282", someField: "x" }) }));
    const adapter = createGspEwayBillAdapter({ ...BASE_URLS, vehicleUpdateUrl: "https://gsp.example.com/veh" }, CREDENTIALS);
    await expect(
      adapter.updateVehicle({ ewbNo: "111000609282", vehicleNo: "PQR1234", fromPlace: "BANGALORE", fromState: "29", reasonCode: "1", reasonRem: "test" }),
    ).resolves.toEqual({ ewbNo: "111000609282", raw: { ewbNo: "111000609282", someField: "x" } });
  });

  it("extend() throws a clear error when no extend URL is configured", async () => {
    const adapter = createGspEwayBillAdapter(BASE_URLS, CREDENTIALS);
    await expect(
      adapter.extend({ ewbNo: "111000609282", remainingDistance: 100, extnRsnCode: "1", extnRemarks: "test" }),
    ).rejects.toThrow("No extend-validity URL is configured");
  });

  it("extend() posts to extendUrl and returns the normalized response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ewbNo: "111000609282", validUpto: "2026-09-20T00:00:00Z" }) }));
    const adapter = createGspEwayBillAdapter({ ...BASE_URLS, extendUrl: "https://gsp.example.com/extend" }, CREDENTIALS);
    await expect(
      adapter.extend({ ewbNo: "111000609282", remainingDistance: 100, extnRsnCode: "1", extnRemarks: "test" }),
    ).resolves.toEqual({ ewbNo: "111000609282", validUpto: "2026-09-20T00:00:00Z", raw: { ewbNo: "111000609282", validUpto: "2026-09-20T00:00:00Z" } });
  });

  it("status() throws a clear error when no status URL is configured", async () => {
    const adapter = createGspEwayBillAdapter(BASE_URLS, CREDENTIALS);
    await expect(adapter.status({ ewbNo: "111000609282" })).rejects.toThrow("No status URL is configured");
  });

  it("status() GETs the ewbNo-suffixed status URL and returns the normalized + raw fields", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ewbNo: "111000609282", status: "ACT" }) }));
    const adapter = createGspEwayBillAdapter({ ...BASE_URLS, statusUrl: "https://gsp.example.com/status" }, CREDENTIALS);
    await expect(adapter.status({ ewbNo: "111000609282" })).resolves.toEqual({ ewbNo: "111000609282", status: "ACT" });
  });

  it("status() defaults status to 'unknown' and falls back to the request's own ewbNo when the response has neither", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }));
    const adapter = createGspEwayBillAdapter({ ...BASE_URLS, statusUrl: "https://gsp.example.com/status" }, CREDENTIALS);
    await expect(adapter.status({ ewbNo: "111000609282" })).resolves.toEqual({ ewbNo: "111000609282", status: "unknown" });
  });
});
