import { describe, expect, it, vi } from "vitest";

// EXP-FSM-01..09 -- every Service export is registered once, under the fsm licence.

vi.mock("./queries", () => ({}));
vi.mock("../lib/events/queries", () => ({}));
vi.mock("../lib/employees/queries", () => ({}));
vi.mock("../lib/assessments/queries", () => ({}));
vi.mock("../lib/assessments/mutations", () => ({ ASSESSMENT_OUTCOME_LABEL: {} }));

import { FSM_EXPORTS } from "./index";

describe("FSM_EXPORTS", () => {
  it("lists the nine Service adapters, each an fsm export with a unique id", () => {
    expect(FSM_EXPORTS.map((a) => a.id)).toEqual([
      "fsm.dashboard",
      "fsm.customers",
      "fsm.jobs",
      "fsm.opportunities",
      "fsm.invoices",
      "fsm.schedule",
      "fsm.my-day",
      "fsm.reports",
      "fsm.assessment",
    ]);
    for (const adapter of FSM_EXPORTS) expect(adapter.module).toBe("fsm");
  });
});
