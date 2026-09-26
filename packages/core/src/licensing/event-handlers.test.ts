import { describe, expect, it } from "vitest";
import { getEventHandlers } from "../events/registry";
import { ACKNOWLEDGED_LICENSE_EVENTS } from "./event-handlers";

// BILL-01: no license lifecycle event may reach the drain without a handler -- that is a
// permanent failure there.
describe("license event handlers", () => {
  it("registers a handler for every event licensing/lifecycle.ts publishes", () => {
    for (const type of ACKNOWLEDGED_LICENSE_EVENTS) expect(getEventHandlers(type).length).toBeGreaterThan(0);
  });

  it("matches the event types core.license_events allows", () => {
    expect([...ACKNOWLEDGED_LICENSE_EVENTS].sort()).toEqual(
      ["activated", "deactivated", "reactivated", "expired", "cancellation_scheduled", "cancellation_undone"].map((t) => `license.${t}`).sort(),
    );
  });
});
