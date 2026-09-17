import { describe, expect, it, vi } from "vitest";
import { getEventHandler, registerEventHandler } from "./registry";

describe("event handler registry", () => {
  it("returns undefined for an unregistered type — the drain loop's 'permanent failure' signal", () => {
    expect(getEventHandler("registry.never-registered")).toBeUndefined();
  });

  it("returns the handler registered for a type", () => {
    const handler = vi.fn();
    registerEventHandler("registry.one", handler);
    expect(getEventHandler("registry.one")).toBe(handler);
  });

  it("keys handlers by type, so one module's registration cannot shadow another's", () => {
    const first = vi.fn();
    const second = vi.fn();
    registerEventHandler("registry.a", first);
    registerEventHandler("registry.b", second);
    expect(getEventHandler("registry.a")).toBe(first);
    expect(getEventHandler("registry.b")).toBe(second);
  });

  it("lets a later registration replace an earlier one for the same type", () => {
    const original = vi.fn();
    const replacement = vi.fn();
    registerEventHandler("registry.replaced", original);
    registerEventHandler("registry.replaced", replacement);
    expect(getEventHandler("registry.replaced")).toBe(replacement);
  });
});
