import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ExportContext } from "@cofounderai/core/exports/server";
import { renderExport } from "@cofounderai/core/exports/render";
import type { ExportWorkbookDefinition } from "@cofounderai/core/exports/types";
import type { CustomerExportRow } from "./queries";

// EXP-FSM-02 -- Service customers export.

const rows = vi.hoisted(() => ({ value: [] as unknown[] }));
const listCustomersForExport = vi.hoisted(() => vi.fn(async () => rows.value));
vi.mock("./queries", () => ({ listCustomersForExport }));

import { fsmCustomersExport } from "./customers";

const context: ExportContext = {
  businessId: "biz-a",
  businessSlug: "acme",
  businessName: "Acme Services",
  timeZone: "Asia/Kolkata",
  userId: "user-1",
  userEmail: "owner@example.com",
  format: "csv",
  scope: "view",
};

async function csv(workbook: ExportWorkbookDefinition): Promise<string[]> {
  const file = await renderExport(workbook, "csv", { timeZone: context.timeZone, generatedAt: new Date("2026-09-26T06:00:00Z") });
  return new TextDecoder().decode(file.body).trim().split("\r\n");
}

const customer: CustomerExportRow = {
  id: "party-1",
  name: "Asha Traders",
  email: "asha@example.com",
  phone: null,
  is_active: true,
  created_at: "2026-01-01T04:30:00Z",
  contacts: ["Anu (123)", "Kiran S (kiran@example.com)"],
  address: "Pune, MH",
  job_count: 3,
  completed_job_count: 1,
  open_job_count: 1,
  open_opportunity_count: 2,
  outstanding_balance: 1500.5,
};

beforeEach(() => {
  rows.value = [customer];
  listCustomersForExport.mockClear();
});

describe("fsm.customers (EXP-FSM-02)", () => {
  it("is the fsm module's licence-gated export with the page's own (empty) permission set", () => {
    expect(fsmCustomersExport.id).toBe("fsm.customers");
    expect(fsmCustomersExport.module).toBe("fsm");
    expect(fsmCustomersExport.permissions).toEqual([]);
  });

  it("reads the business the runner resolved, never one named in the request", async () => {
    const filters = fsmCustomersExport.parseFilters!(new URLSearchParams("businessId=biz-b&workspaceId=w-9&status=x"));
    expect(filters).toEqual({});
    await fsmCustomersExport.load(context, filters);
    expect(listCustomersForExport).toHaveBeenCalledWith("biz-a");
  });

  it("writes labelled columns, money as numbers, blanks as blanks", async () => {
    const workbook = await fsmCustomersExport.load(context, {});
    expect(workbook).toMatchObject({ module: "fsm", resource: "customers" });
    const [header, line] = await csv(workbook);
    expect(header).toBe(
      "Customer,Email,Phone,Contacts,Address,Jobs (all time),Jobs completed,Open jobs,Open opportunities,Outstanding balance,Status,Customer since",
    );
    expect(line).toBe("Asha Traders,asha@example.com,,Anu (123); Kiran S (kiran@example.com),\"Pune, MH\",3,1,1,2,1500.5,Active,2026-01-01T10:00:00+05:30");
  });

  it("exports no internal ids and a valid file when there are no customers", async () => {
    const text = (await csv(await fsmCustomersExport.load(context, {}))).join("\n");
    expect(text).not.toContain("party-1");
    rows.value = [];
    expect(await csv(await fsmCustomersExport.load(context, {}))).toHaveLength(1);
  });
});
