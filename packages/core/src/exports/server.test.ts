import { beforeEach, describe, expect, it, vi } from "vitest";

// EXP-PLAT-05: the one server-side export path -- every refusal, the audit trail, and
// that nothing the client sends is trusted as authorization.

const state = vi.hoisted(() => ({
  user: { id: "user-1", email: "owner@example.com" } as { id: string; email: string } | null,
  businessBySlug: { acme: "biz-a" } as Record<string, string>,
  licensed: true,
  platformStatus: "available" as string,
  permissions: new Set<string>(["crm.view"]),
  audits: [] as { action: string; businessId: string; after: Record<string, unknown> }[],
  auditFails: false,
}));

vi.mock("../db/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: state.user } }) },
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: table === "businesses" ? { name: "Acme Ltd" } : { timezone: "Asia/Kolkata" },
          }),
        }),
      }),
    }),
  }),
}));
vi.mock("../businesses/resolve", () => ({
  resolveBusinessIdBySlug: async (slug: string) => state.businessBySlug[slug] ?? null,
}));
vi.mock("../licensing/queries", () => ({
  hasModule: async () => state.licensed,
  getPlatformModuleStatus: async () => ({ status: state.platformStatus, message: null }),
}));
vi.mock("../rbac/require-permission", () => ({
  hasPermission: async (_businessId: string, key: string) => state.permissions.has(key),
}));
vi.mock("../audit/mutations", () => ({
  writeAuditLog: async (input: { action: string; businessId: string; after: Record<string, unknown> }) => {
    if (state.auditFails) throw new Error("audit down");
    state.audits.push(input);
    return "audit-id";
  },
}));

import { ExportDeniedError, runBusinessExport, type ExportAdapter } from "./server";

type Lead = { name: string; email: string };
const LEADS: Lead[] = [
  { name: "Asha", email: "asha@example.com" },
  { name: "Ravi", email: "ravi@example.com" },
];

function adapter(overrides: Partial<ExportAdapter<{ status: string }>> = {}): ExportAdapter<{ status: string }> {
  return {
    id: "crm.leads",
    module: "crm",
    permissions: ["crm.view"],
    parseFilters: (params) => ({ status: params.get("status") ?? "" }),
    describeFilters: (filters) => ({ Status: filters.status }),
    load: async (context, filters) => ({
      module: "crm",
      resource: "leads",
      title: `Leads for ${context.businessName}`,
      sheets: [
        {
          sheetName: "Leads",
          columns: [
            { key: "name", header: "Name", getValue: (r: Lead) => r.name },
            { key: "email", header: "Email", getValue: (r: Lead) => r.email },
          ],
          rows: filters.status === "none" ? [] : LEADS,
        },
      ],
    }),
    ...overrides,
  };
}

const request = (query: string) => new Request(`https://app.example.com/api/exports/crm.leads?${query}`);

beforeEach(() => {
  state.user = { id: "user-1", email: "owner@example.com" };
  state.licensed = true;
  state.platformStatus = "available";
  state.permissions = new Set(["crm.view"]);
  state.audits = [];
  state.auditFails = false;
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("runBusinessExport", () => {
  it("serves a CSV with a standard filename and audits it with metadata only", async () => {
    const response = await runBusinessExport(request("business=acme&format=csv&scope=all&status=open"), adapter());
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/csv; charset=utf-8");
    expect(response.headers.get("content-disposition")).toMatch(/^attachment; filename="wonderark_crm_leads_\d{4}-\d{2}-\d{2}\.csv"/);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const text = await response.text();
    expect(text).toContain("Name,Email");
    expect(text).toContain("Asha,asha@example.com");

    expect(state.audits).toHaveLength(1);
    const [entry] = state.audits;
    expect(entry).toMatchObject({ action: "export.generated", businessId: "biz-a" });
    expect(entry!.after).toEqual({
      module: "crm",
      resource: "leads",
      format: "csv",
      scope: "all",
      filters: { Status: "open" },
      row_count: 2,
    });
    // The audit entry never carries the data itself.
    expect(JSON.stringify(entry)).not.toContain("asha@example.com");
  });

  it("serves an Excel workbook", async () => {
    const response = await runBusinessExport(request("business=acme&format=xlsx"), adapter());
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    expect(response.headers.get("content-disposition")).toContain(".xlsx");
  });

  it("produces a valid, header-only file when nothing matches", async () => {
    const response = await runBusinessExport(request("business=acme&format=csv&status=none"), adapter());
    const bytes = new Uint8Array(await response.arrayBuffer());
    // UTF-8 BOM, then the header row and nothing else (Response.text() would strip the BOM).
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    expect(new TextDecoder().decode(bytes.slice(3))).toBe("Name,Email\r\n");
    expect(response.headers.get("x-export-row-count")).toBe("0");
  });

  it("refuses an unknown format", async () => {
    expect((await runBusinessExport(request("business=acme&format=pdf"), adapter())).status).toBe(400);
  });

  it("refuses a signed-out request", async () => {
    state.user = null;
    expect((await runBusinessExport(request("business=acme&format=csv"), adapter())).status).toBe(401);
  });

  it("treats a business the user doesn't belong to exactly like one that doesn't exist", async () => {
    const response = await runBusinessExport(request("business=someone-else&format=csv"), adapter());
    expect(response.status).toBe(404);
    expect(state.audits).toHaveLength(0);
  });

  it("refuses an unlicensed module with MODULE_NOT_LICENSED", async () => {
    state.licensed = false;
    const response = await runBusinessExport(request("business=acme&format=csv"), adapter());
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ error: "MODULE_NOT_LICENSED" });
  });

  it("refuses while the module is disabled platform-wide", async () => {
    state.platformStatus = "maintenance";
    expect((await runBusinessExport(request("business=acme&format=csv"), adapter())).status).toBe(403);
  });

  it("still exports while the platform has the module read-only", async () => {
    state.platformStatus = "read_only";
    expect((await runBusinessExport(request("business=acme&format=csv"), adapter())).status).toBe(200);
  });

  it("refuses without the page's read permission", async () => {
    state.permissions = new Set();
    expect((await runBusinessExport(request("business=acme&format=csv"), adapter())).status).toBe(403);
  });

  it("passes an adapter's own denial through as 403", async () => {
    const denying = adapter({
      load: async () => {
        throw new ExportDeniedError("Cost prices are restricted.");
      },
    });
    const response = await runBusinessExport(request("business=acme&format=csv"), denying);
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ message: "Cost prices are restricted." });
  });

  it("audits a failure and says so plainly", async () => {
    const broken = adapter({
      load: async () => {
        throw new Error("db down");
      },
    });
    const response = await runBusinessExport(request("business=acme&format=csv"), broken);
    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({ message: "We could not generate this export. No data was changed." });
    expect(state.audits.map((a) => a.action)).toEqual(["export.failed"]);
  });

  it("does not serve a file it could not audit", async () => {
    state.auditFails = true;
    expect((await runBusinessExport(request("business=acme&format=csv"), adapter())).status).toBe(500);
  });

  it("hands a dataset over the row limit to the large-export handler", async () => {
    const largeExport = vi.fn(async () => Response.json({ status: "queued" }, { status: 202 }));
    const response = await runBusinessExport(request("business=acme&format=xlsx&scope=all"), adapter(), {
      largeExport,
      rowLimit: 1,
    });
    expect(response.status).toBe(202);
    expect(largeExport).toHaveBeenCalledOnce();
    expect(state.audits).toHaveLength(0); // the job audits itself when it finishes
  });

  it("never lets the query string choose the business id, licence or permission", async () => {
    state.licensed = false;
    const response = await runBusinessExport(
      request("business=acme&format=csv&businessId=biz-b&licensed=true&permission=crm.view"),
      adapter(),
    );
    expect(response.status).toBe(403);
  });
});
