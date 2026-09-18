/**
 * The shell's streamed props (alerts, the AI-credits figure) are either a value or a
 * promise of one, and `use()` must only ever be handed the latter -- calling it on a
 * plain array throws. This pins the one check that keeps the two apart.
 */
import { describe, expect, it } from "vitest";
import { isPromiseLike } from "./promise-like";

describe("isPromiseLike", () => {
  it("recognises a real promise", () => {
    expect(isPromiseLike(Promise.resolve(1))).toBe(true);
  });

  it("recognises any thenable, not just a native Promise", () => {
    expect(isPromiseLike({ then: () => undefined } as unknown as PromiseLike<number>)).toBe(true);
  });

  it("leaves plain values alone", () => {
    expect(isPromiseLike(3)).toBe(false);
    expect(isPromiseLike([])).toBe(false);
    expect(isPromiseLike(undefined)).toBe(false);
    expect(isPromiseLike(null as unknown as undefined)).toBe(false);
  });

  it("does not mistake an object with a non-function `then` for a promise", () => {
    expect(isPromiseLike({ then: "soon" } as unknown as PromiseLike<string>)).toBe(false);
  });
});
