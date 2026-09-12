import { describe, expect, it } from "vitest";
import { downstreamOf, STAGE_DEPENDENCIES } from "./dependencies";
import { PIPELINE_STAGE_KEYS } from "./types";

describe("STAGE_DEPENDENCIES", () => {
  it("has an entry for every technical stage key", () => {
    expect(Object.keys(STAGE_DEPENDENCIES).sort()).toEqual([...PIPELINE_STAGE_KEYS].sort());
  });

  it("has no cycles -- every stage is reachable from website_understanding within the pipeline's own length", () => {
    // A cheap cycle guard: if downstreamOf(website_understanding) doesn't already cover
    // every other stage, either an edge is missing or (worse) a cycle prevented the BFS
    // from terminating with full coverage.
    expect(downstreamOf("website_understanding").sort()).toEqual(
      PIPELINE_STAGE_KEYS.filter((k) => k !== "website_understanding").sort(),
    );
  });
});

describe("downstreamOf", () => {
  it("returns nothing downstream of the very last stage", () => {
    expect(downstreamOf("crm_handoff")).toEqual([]);
  });

  it("returns every other stage downstream of the very first stage, in execution order", () => {
    const result = downstreamOf("website_understanding");
    expect(result).toEqual(PIPELINE_STAGE_KEYS.slice(1));
  });

  it("leaves buyer_personas as a dead-end branch with nothing downstream of it", () => {
    expect(downstreamOf("buyer_personas")).toEqual([]);
  });

  it("computes the icp branch correctly, including both parallel children and their own descendants", () => {
    const result = downstreamOf("icp");
    expect(result).toContain("buyer_personas");
    expect(result).toContain("discovery_strategy");
    expect(result).toContain("account_discovery");
    expect(result).toContain("crm_handoff");
    expect(result).not.toContain("icp");
    expect(result).not.toContain("offering_profile");
  });

  it("union-reduces the two parallel branches feeding recommended_action", () => {
    // Invalidating opportunity_scoring must affect BOTH why_now and research (and
    // research's own child buyer_intelligence), not just one branch.
    const result = downstreamOf("opportunity_scoring");
    expect(result).toEqual(["why_now", "research", "buyer_intelligence", "recommended_action", "crm_handoff"]);
  });
});
