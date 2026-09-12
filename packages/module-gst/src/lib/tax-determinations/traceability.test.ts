import { describe, expect, it } from "vitest";
import { resolveRuleRefs } from "./traceability";

describe("resolveRuleRefs", () => {
  it("returns an empty list without querying anything for an empty input (no determination cited any rule)", async () => {
    // A real, valid state (COMPLY-P0-02.5's own migration: "may cite zero rules, e.g. an
    // out-of-scope/no-tax result") -- must short-circuit before ever touching the
    // database, since createClient() would otherwise require a real request context
    // this unit test has none of.
    await expect(resolveRuleRefs([])).resolves.toEqual([]);
  });
});
