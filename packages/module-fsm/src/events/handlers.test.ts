import { describe, expect, it } from "vitest";
import { getEventHandlers } from "@cofounderai/core/events/registry";
import { ACKNOWLEDGED_ESTIMATE_EVENTS } from "./handlers";

// An event with no handler fails permanently in the drain; estimate.sent did, every time.
describe("fsm event handlers", () => {
  it("registers a handler for every estimate event lib/estimates publishes", () => {
    for (const type of ACKNOWLEDGED_ESTIMATE_EVENTS) expect(getEventHandlers(type).length).toBeGreaterThan(0);
  });
});
