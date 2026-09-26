import { describe, expect, it } from "vitest";
import { offeringSwitchHref } from "./context";

// DISC-OFFER-P0-03.1 "Offering Context Selector"
const BASE = "/acme/discovery/offerings";

describe("offeringSwitchHref", () => {
  it("keeps the section when switching offering", () => {
    expect(offeringSwitchHref(BASE, "/acme/discovery/offerings/iam/icp", "iam", "training")).toBe("/acme/discovery/offerings/training/icp");
    expect(offeringSwitchHref(BASE, "/acme/discovery/offerings/iam/watchlist", "iam", "training")).toBe("/acme/discovery/offerings/training/watchlist");
    expect(offeringSwitchHref(BASE, "/acme/discovery/offerings/iam", "iam", "training")).toBe("/acme/discovery/offerings/training");
  });

  it("drops a record from the old offering for that section's list, never leaking it into the new one", () => {
    expect(offeringSwitchHref(BASE, "/acme/discovery/offerings/iam/prospects/p-123", "iam", "training")).toBe("/acme/discovery/offerings/training/prospects");
    expect(offeringSwitchHref(BASE, "/acme/discovery/offerings/iam/history/run-9", "iam", "training")).toBe("/acme/discovery/offerings/training/history");
  });

  it("falls back to the offering overview for unknown sections or foreign paths", () => {
    expect(offeringSwitchHref(BASE, "/acme/discovery/offerings/iam/run-ai-discovery", "iam", "training")).toBe("/acme/discovery/offerings/training");
    expect(offeringSwitchHref(BASE, "/acme/discovery/marketing", "iam", "training")).toBe("/acme/discovery/offerings/training");
    expect(offeringSwitchHref(BASE, "/acme/discovery/offerings/iamx/icp", "iam", "training")).toBe("/acme/discovery/offerings/training");
  });
});
