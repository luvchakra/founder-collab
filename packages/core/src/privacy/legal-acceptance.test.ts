import { describe, expect, it } from "vitest";
import { pendingAcceptances, type LegalStatusRow } from "./legal-acceptance";

// PLATFORM-P1-09.4: who is asked to accept what.
const row = (over: Partial<LegalStatusRow>): LegalStatusRow => ({
  document: "terms",
  version_id: "v",
  version: "2026-10",
  summary: "s",
  published_at: "2026-10-10T00:00:00Z",
  requires_acceptance: true,
  accepted: false,
  ever_accepted: false,
  ...over,
});

describe("pendingAcceptances", () => {
  it("asks for a version that requires acceptance until it is accepted", () => {
    expect(pendingAcceptances([row({})])).toHaveLength(1);
    expect(pendingAcceptances([row({ accepted: true, ever_accepted: true })])).toHaveLength(0);
    expect(pendingAcceptances([row({ ever_accepted: true })])).toHaveLength(1);
  });

  it("doesn't ask again for a minor version once an earlier one was accepted", () => {
    expect(pendingAcceptances([row({ requires_acceptance: false, ever_accepted: true })])).toHaveLength(0);
  });

  it("still asks someone who never accepted any version, even for a minor one", () => {
    expect(pendingAcceptances([row({ requires_acceptance: false })])).toHaveLength(1);
  });

  it("asks nothing when nothing is published", () => {
    expect(pendingAcceptances([])).toEqual([]);
  });
});
