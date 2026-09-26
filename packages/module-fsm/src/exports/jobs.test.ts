import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ExportContext } from "@cofounderai/core/exports/server";
import { renderExport } from "@cofounderai/core/exports/render";
import type { ExportWorkbookDefinition } from "@cofounderai/core/exports/types";
import type { JobExportRow } from "./queries";

// EXP-FSM-03 -- Service jobs export.

const rows = vi.hoisted(() => ({ value: [] as unknown[] }));
const listJobsForExport = vi.hoisted(() => vi.fn(async () => rows.value));
vi.mock("./queries", () => ({ listJobsForExport }));

import { fsmJobsExport } from "./jobs";

const context: ExportContext = {
  businessId: "biz-a",
  businessSlug: "acme",
  businessName: "Acme Services",
  timeZone: "Asia/Kolkata",
  userId: "user-1",
  userEmail: "owner@example.com",
  format: "csv",
  scope: "all",
};

async function csv(workbook: ExportWorkbookDefinition): Promise<string[]> {
  const file = await renderExport(workbook, "csv", { timeZone: context.timeZone, generatedAt: new Date("2026-09-26T06:00:00Z") });
  return new TextDecoder().decode(file.body).trim().split("\r\n");
}

const job = (overrides: Partial<JobExportRow>): JobExportRow =>
  ({
    id: "job-1",
    business_id: "biz-a",
    number: "JOB-1",
    party_id: "party-1",
    party_name: "Asha Traders",
    service_type_name: "AC service",
    status: "in_progress",
    outcome: null,
    description: "=HYPERLINK(\"http://x\")",
    started_at: "2026-09-05T04:00:00Z",
    completed_at: null,
    created_at: "2026-09-01T04:30:00Z",
    technician_names: ["Ravi", "Meena"],
    scheduled_start: "2026-09-05T03:30:00Z",
    opportunity_source: "contact_form",
    invoiced_amount: 750,
    ...overrides,
  }) as JobExportRow;

beforeEach(() => {
  rows.value = [job({}), job({ id: "job-2", number: "JOB-2", status: "completed", outcome: "warranty_revisit_required", technician_names: [], scheduled_start: null, opportunity_source: null, invoiced_amount: null, description: null, started_at: null, completed_at: "2026-09-06T10:00:00Z" })];
  listJobsForExport.mockClear();
});

describe("fsm.jobs (EXP-FSM-03)", () => {
  it("is licence-gated with the page's own (empty) permission set", () => {
    expect(fsmJobsExport).toMatchObject({ id: "fsm.jobs", module: "fsm", permissions: [] });
  });

  it("reads the resolved business, ignoring any tenant id in the request", async () => {
    const filters = fsmJobsExport.parseFilters!(new URLSearchParams("businessId=biz-b&status=completed"));
    expect(filters).toEqual({});
    await fsmJobsExport.load(context, filters);
    expect(listJobsForExport).toHaveBeenCalledTimes(1);
    expect(listJobsForExport).toHaveBeenCalledWith("biz-a");
  });

  it("writes the story's fields with labels, numbers, and blanks for what a job lacks", async () => {
    const [header, first, second] = await csv(await fsmJobsExport.load(context, {}));
    expect(header).toBe("Job #,Customer,Service type,Status,Technician,Scheduled,Started,Completed,Outcome,Invoiced value,Source,Description,Created");
    expect(first).toBe(
      "JOB-1,Asha Traders,AC service,In Progress,Ravi; Meena,2026-09-05T09:00:00+05:30,2026-09-05T09:30:00+05:30,,,750,Contact form,\"'=HYPERLINK(\"\"http://x\"\")\",2026-09-01T10:00:00+05:30",
    );
    expect(second).toBe("JOB-2,Asha Traders,AC service,Completed,,,,2026-09-06T15:30:00+05:30,Warranty/revisit required,,,,2026-09-01T10:00:00+05:30");
  });

  it("exports no internal ids", async () => {
    const text = (await csv(await fsmJobsExport.load(context, {}))).join("\n");
    expect(text).not.toMatch(/job-1|party-1|biz-a/);
  });
});
