import { describe, expect, it } from "vitest";
import { createActivity } from "./mutations";

describe("createActivity", () => {
  it("rejects an activity attached to nothing, with a clear message rather than a raw constraint error", async () => {
    await expect(createActivity("biz-1", { type: "call" })).rejects.toThrow(
      "createActivity: at least one of partyId, leadId, opportunityId, conversationId is required",
    );
  });
});
