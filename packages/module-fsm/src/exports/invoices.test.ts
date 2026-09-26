import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ExportContext } from "@cofounderai/core/exports/server";
import { renderExport } from "@cofounderai/core/exports/render";
import type { ExportWorkbookDefinition } from "@cofounderai/core/exports/types";
import type { InvoiceListItem } from "../lib/invoices/types";

// EXP-FSM-05 -- Service invoices export.

const rows = vi.hoisted(() => ({ value: [] as unknown[] }));
const listInvoicesForExport = vi.hoisted(() => vi.fn(async () => rows.value));
vi.mock("./queries", () => ({ listInvoicesForExport }));

import { fsmInvoicesExport } from "./invoices";

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

const render = (workbook: ExportWorkbookDefinition, format: "csv" | "xlsx") =>
  renderExport(workbook, format, { timeZone: context.timeZone, generatedAt: new Date("2026-09-26T06:00:00Z") });

const invoice: InvoiceListItem = {
  id: "doc-1",
  number: "INV-0001",
  status: "partially_paid",
  doc_date: "2026-09-01",
  due_date: null,
  job_id: "job-1",
  party_id: "party-1",
  party_name: "Asha Traders",
  job_number: "JOB-1",
  subtotal: 1000,
  discount_amount: 0,
  shipping_amount: 50,
  cgst_amount: 90.1,
  sgst_amount: 90.2,
  igst_amount: 0,
  total_amount: 1230.3,
  balance_amount: 230.3,
  created_at: "2026-09-01T04:30:00Z",
  updated_at: "2026-09-01T04:30:00Z",
};

beforeEach(() => {
  rows.value = [invoice];
  listInvoicesForExport.mockClear();
});

describe("fsm.invoices (EXP-FSM-05)", () => {
  it("is licence-gated with the page's own (empty) permission set", () => {
    expect(fsmInvoicesExport).toMatchObject({ id: "fsm.invoices", module: "fsm", permissions: [] });
  });

  it("reads the resolved business, ignoring any tenant id in the request", async () => {
    const filters = fsmInvoicesExport.parseFilters!(new URLSearchParams("businessId=biz-b&tab=unpaid"));
    expect(filters).toEqual({});
    await fsmInvoicesExport.load(context, filters);
    expect(listInvoicesForExport).toHaveBeenCalledWith("biz-a");
  });

  it("writes the story's fields: dates as calendar days, money as numbers, status as a label", async () => {
    const file = await render(await fsmInvoicesExport.load(context, {}), "csv");
    const [header, line] = new TextDecoder().decode(file.body).trim().split("\r\n");
    expect(header).toBe("Invoice #,Customer,Job #,Invoice date,Due date,Subtotal,Discount,Shipping,CGST,SGST,IGST,Tax,Total,Balance,Payment status,Created");
    expect(line).toBe("INV-0001,Asha Traders,JOB-1,2026-09-01,,1000,0,50,90.1,90.2,0,180.3,1230.3,230.3,Partially paid,2026-09-01T10:00:00+05:30");
    expect(line).not.toMatch(/doc-1|party-1|job-1/);
  });

  it("types every amount as an INR currency column, so Excel formats it as money", async () => {
    const [sheet] = (await fsmInvoicesExport.load(context, {})).sheets;
    const money = sheet!.columns.filter((c) => c.type === "currency").map((c) => c.header);
    expect(money).toEqual(["Subtotal", "Discount", "Shipping", "CGST", "SGST", "IGST", "Tax", "Total", "Balance"]);
    expect(sheet!.columns.filter((c) => c.type === "currency").every((c) => c.currency === "INR")).toBe(true);
    const xlsx = await render(await fsmInvoicesExport.load(context, {}), "xlsx");
    expect(xlsx.filename).toBe("wonderark_fsm_invoices_2026-09-26.xlsx");
    expect(xlsx.rowCount).toBe(1);
  });
});
