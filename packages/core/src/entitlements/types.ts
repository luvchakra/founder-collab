/**
 * PLATFORM-P0-05 (Entitlement Engine, `docs/plan/09-PLATFORM-ADMIN-PORTAL-BACKLOG.md` §9)
 * -- shared types for the "one authoritative service" §9/PLATFORM-P0-05.1 asks for.
 *
 * `EntitlementSource` names every layer of PLATFORM-P0-05.2's own recommended precedence
 * chain (Platform Global -> Plan -> Business Override -> User Permission), plus `license`
 * for the one layer that already existed before this section: `core.licenses`' per-module
 * active/grace/expired status (Epic 2, story C-3). The type exists in full even though, as
 * of PLATFORM-P0-05.1, only `license` is ever actually produced -- see that file's own
 * docstring for exactly which of these are wired up today and why the rest are not yet:
 * `platform_global` needs PLATFORM-P0-07.2 (module kill switch, "Not started"); `plan`
 * needs a business<->`platform.plans` assignment that no P0 story in this doc defines
 * (`core.business_settings.plan` is a free-text label with no such link, confirmed in
 * PLATFORM-P0-04.1's own audit entry); `business_override` is explicitly
 * PLATFORM-P1-02.1's own later scope. Declaring the full union now (rather than adding a
 * member per future story) means every future caller's `switch (decision.source)` is
 * exhaustive from day one, and a future story only has to start *producing* a value this
 * type already accepted.
 */
export type EntitlementSource = "license" | "platform_global" | "plan" | "business_override" | "user_permission";

/**
 * PLATFORM-P0-05.3's own literal return shape: `allowed`, `reason`, `source`, `limit`,
 * `usage`, `remaining`. `limit`/`usage`/`remaining` are `null` for a decision that has no
 * numeric quantity behind it (e.g. `hasModule()` -- "is this module licensed" is a
 * yes/no fact, not a consumable resource) -- never `0`, which would misread as "a real
 * limit of zero" the same way PLATFORM-P0-04.5/04.6's own tri-state `plan_limits` design
 * already refuses to let "unlimited" collapse into a magic number.
 */
export type EntitlementDecision = {
  allowed: boolean;
  reason: string;
  source: EntitlementSource;
  limit: number | null;
  usage: number | null;
  remaining: number | null;
};
