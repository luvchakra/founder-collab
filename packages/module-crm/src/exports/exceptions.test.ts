import { beforeEach, describe, expect, it, vi } from "vitest";

// EXP-CRM-10 (Exceptions) -- Exception Center export.

const mocks = vi.hoisted(() => ({ listCrossModuleExceptions: vi.fn(), hasModule: vi.fn() }));
vi.mock("../lib/exceptions/queries", () => ({ listCrossModuleExceptions: mocks.listCrossModuleExceptions }));
vi.mock("@cofounderai/core/licensing/queries", () => ({ hasModule: mocks.hasModule }));

import { crmExceptionsExport } from "./exceptions";
import { BUSINESS_ID, exportContext, headers, requestParams, rowsOf } from "./test-support";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.hasModule.mockResolvedValue(true);
  mocks.listCrossModuleExceptions.mockResolvedValue([
    {
      id: "fsm_parts_shortage:j1",
      kind: "fsm_parts_shortage",
      module: "fsm",
      label: "Asha -- job short on parts",
      detail: "JOB-0042",
      detailHref: "/x",
      entityId: "j1",
      assessmentRequested: null,
    },
    {
      id: "assessment_pending:o1",
      kind: "assessment_pending",
      module: "crm",
      label: "Ravi -- assessment pending",
      detail: "Requested, awaiting outcome",
      detailHref: "/y",
      entityId: "o1",
      assessmentRequested: true,
    },
  ]);
});

describe("crm.exceptions (EXP-CRM-10)", () => {
  it("is licensed and permissioned like the page", () => {
    expect(crmExceptionsExport.id).toBe("crm.exceptions");
    expect(crmExceptionsExport.module).toBe("crm");
    expect(crmExceptionsExport.permissions).toEqual(["crm.view"]);
  });

  it("reads the resolved business only (tenant isolation)", async () => {
    await crmExceptionsExport.load(exportContext(), crmExceptionsExport.parseFilters!(requestParams({ module: "fsm" })));
    expect(mocks.listCrossModuleExceptions).toHaveBeenCalledWith(BUSINESS_ID);
    expect(mocks.hasModule).toHaveBeenCalledWith(BUSINESS_ID, "fsm");
  });

  it("exports exception, module, subject, status and resolution as labels", async () => {
    const workbook = await crmExceptionsExport.load(exportContext(), {});
    expect(headers(workbook, "Exceptions")).toEqual(["Exception", "Module", "Customer / job", "Detail", "Status", "Resolution"]);
    expect(rowsOf(workbook, "Exceptions")).toEqual([
      { Exception: "Job short on parts", Module: "FSM", "Customer / job": "Asha -- job short on parts", Detail: "JOB-0042", Status: "Open", Resolution: "Awaiting a shortage decision" },
      {
        Exception: "Assessment pending",
        Module: "CRM",
        "Customer / job": "Ravi -- assessment pending",
        Detail: "Requested, awaiting outcome",
        Status: "Open",
        Resolution: "Assessment requested, awaiting outcome",
      },
    ]);
    expect(workbook.metadata).toBeUndefined();
  });

  it("notes when FSM data is unavailable", async () => {
    mocks.hasModule.mockResolvedValue(false);
    mocks.listCrossModuleExceptions.mockResolvedValue([]);
    const workbook = await crmExceptionsExport.load(exportContext(), {});
    expect(rowsOf(workbook, "Exceptions")).toEqual([]);
    expect(workbook.metadata).toEqual({ "FSM parts shortages": "FSM unavailable (not licensed) -- not included" });
  });
});
