/**
 * `hashInput` is the cache key for `ai_runs` (CLAUDE.md principle #5: cache all
 * repeatable AI operations, keyed by input_hash + prompt_version). A wrong answer here
 * is either duplicate spend (false miss) or a stale result served for different input
 * (false hit), so both directions are pinned.
 */
import { describe, expect, it } from "vitest";
import { hashInput } from "./hash";

describe("hashInput", () => {
  it("returns a hex sha256 digest", () => {
    expect(hashInput({ prompt: "hello" })).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is stable across calls for the same input — the cache-hit case", () => {
    const input = { operation: "research_prospect", company: "Acme", size: 200 };
    expect(hashInput(input)).toBe(hashInput({ ...input }));
  });

  it("changes when any part of the input changes — the cache-miss case", () => {
    expect(hashInput({ company: "Acme" })).not.toBe(hashInput({ company: "Beta" }));
    expect(hashInput({ company: "Acme" })).not.toBe(hashInput({ company: "Acme", extra: 1 }));
  });

  it("distinguishes values that stringify similarly but are not equal", () => {
    expect(hashInput("1")).not.toBe(hashInput(1));
    expect(hashInput(null)).not.toBe(hashInput("null"));
    expect(hashInput([1, 2])).not.toBe(hashInput(["1,2"]));
  });

  it("distinguishes nesting rather than flattening it", () => {
    expect(hashInput({ a: { b: 1 } })).not.toBe(hashInput({ a: 1, b: 1 }));
  });

  // Characterization, not endorsement: the hash is JSON.stringify-based, so two inputs
  // that are deeply equal but built with their keys in a different order hash
  // differently. The cost is a missed cache hit (a re-run and its spend), never a wrong
  // result, so callers that build input objects should keep key order stable.
  it("is sensitive to object key order", () => {
    expect(hashInput({ a: 1, b: 2 })).not.toBe(hashInput({ b: 2, a: 1 }));
  });
});
