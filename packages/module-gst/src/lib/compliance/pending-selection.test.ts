/**
 * The country bar's select and the badge next to it must never disagree about which
 * country is active. These pin the two halves of that: the control follows the click
 * until the server answers, and follows the server once it has — including when the
 * answer is "no".
 */
import { describe, expect, it } from "vitest";
import { pendingSelection } from "./pending-selection";

describe("pendingSelection", () => {
  it("shows the server's value when the user has picked nothing", () => {
    expect(pendingSelection("IN", null, false)).toBe("IN");
  });

  it("shows the choice the user made while the server has not answered", () => {
    expect(pendingSelection("IN", "SG", false)).toBe("SG");
  });

  // Once accepted, the two agree, so which one is shown stops being a question.
  it("agrees with the server once the change has landed", () => {
    expect(pendingSelection("SG", "SG", false)).toBe("SG");
  });

  // A refused change leaves the server's value untouched, and the control must revert
  // rather than keep advertising the refusal.
  it("reverts to the server's value when the change was rejected", () => {
    expect(pendingSelection("IN", "SG", true)).toBe("IN");
  });

  it("still shows the server's value on rejection when nothing was picked", () => {
    expect(pendingSelection("IN", null, true)).toBe("IN");
  });

  // The property that matters, stated directly: the badge reads the server's value, so
  // whenever the server has spoken the two must match.
  it("never disagrees with the badge once the server has spoken", () => {
    for (const server of ["IN", "SG"]) {
      for (const submitted of [null, "IN", "SG", "MY"]) {
        expect(pendingSelection(server, submitted, true)).toBe(server);
      }
    }
  });
});
