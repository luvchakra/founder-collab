import { describe, expect, it } from "vitest";
import { getEventHandlers } from "@cofounderai/core/events/registry";
import { ACKNOWLEDGED_TICKET_EVENTS } from "./handlers";

// An event with no handler fails permanently in the drain.
describe("crm event handlers", () => {
  it("registers a handler for every ticket event lib/tickets publishes", () => {
    for (const type of ACKNOWLEDGED_TICKET_EVENTS) expect(getEventHandlers(type).length).toBeGreaterThan(0);
  });
});
