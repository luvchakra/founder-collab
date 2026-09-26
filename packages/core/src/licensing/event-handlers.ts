import { registerEventHandler } from "../events/registry";

/**
 * BILL-01 finding -- every license lifecycle change (licensing/lifecycle.ts) publishes a
 * `license.<event>` domain event, but only `license.activated` had a subscriber
 * (module-inventory creates a default warehouse). core/events/drain.ts fails any event with
 * no handler *permanently*, so every deactivation, reactivation, expiry and scheduled
 * cancellation turned into a permanent failure on the platform dashboard's "open issues".
 *
 * The change itself is already recorded -- in core.license_events, in the same write that
 * published the event -- so there is nothing further to do for these by default. They are
 * acknowledged here, explicitly, so a module (or billing) that later needs to react
 * registers a second handler alongside this one rather than inheriting a failure.
 * Imported for its side effect from apps/web/app/api/cron/drain-events/route.ts.
 */
export const ACKNOWLEDGED_LICENSE_EVENTS = [
  "license.activated",
  "license.deactivated",
  "license.reactivated",
  "license.expired",
  "license.cancellation_scheduled",
  "license.cancellation_undone",
] as const;

for (const type of ACKNOWLEDGED_LICENSE_EVENTS) {
  registerEventHandler(type, async () => undefined);
}
