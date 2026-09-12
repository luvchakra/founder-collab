import { describe, expect, it } from "vitest";
import { computeHandoffStatus } from "./handoff";

describe("computeHandoffStatus", () => {
  it("returns not_sent with nothing on record", () => {
    expect(computeHandoffStatus({ opportunityStatus: "new", handoffFailedAt: null, hasExistingCrmLead: false })).toBe("not_sent");
  });

  it("returns sent_to_crm when this opportunity's own status says so, even with a stale failure timestamp", () => {
    expect(
      computeHandoffStatus({ opportunityStatus: "sent_to_crm", handoffFailedAt: "2026-09-10T00:00:00Z", hasExistingCrmLead: false }),
    ).toBe("sent_to_crm");
  });

  it("returns handoff_failed when a failure is recorded and this opportunity hasn't been sent", () => {
    expect(
      computeHandoffStatus({ opportunityStatus: "action_required", handoffFailedAt: "2026-09-10T00:00:00Z", hasExistingCrmLead: false }),
    ).toBe("handoff_failed");
  });

  it("prioritizes handoff_failed over an existing CRM lead found elsewhere", () => {
    expect(
      computeHandoffStatus({ opportunityStatus: "new", handoffFailedAt: "2026-09-10T00:00:00Z", hasExistingCrmLead: true }),
    ).toBe("handoff_failed");
  });

  it("returns already_in_crm when a lead exists but this opportunity's own status hasn't caught up", () => {
    expect(computeHandoffStatus({ opportunityStatus: "new", handoffFailedAt: null, hasExistingCrmLead: true })).toBe(
      "already_in_crm",
    );
  });
});
