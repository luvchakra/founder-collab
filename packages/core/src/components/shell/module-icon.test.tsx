// @vitest-environment jsdom
/**
 * Icons are named as strings in the module manifest and resolved here. A module whose
 * icon name this shell doesn't know must still render — a missing icon should never be
 * the reason a licensed module vanishes from the nav.
 */
import "@testing-library/jest-dom/vitest";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { moduleRegistry } from "@cofounderai/module-registry";
import { ModuleIcon } from "./module-icon";

afterEach(cleanup);

function svgOf(container: HTMLElement) {
  return container.querySelector("svg");
}

describe("ModuleIcon", () => {
  it.each(moduleRegistry.map((m) => [m.key, m.icon]))(
    "resolves the icon the %s manifest declares (%s) to a real icon",
    (_key, icon) => {
      const { container } = render(<ModuleIcon name={icon} />);

      expect(svgOf(container)).toBeInTheDocument();
      expect(svgOf(container)!.classList.contains("lucide-layout-dashboard")).toBe(false);
    },
  );

  it("falls back to a generic icon for an unknown name instead of rendering nothing", () => {
    const { container } = render(<ModuleIcon name="NoSuchIcon" />);

    expect(svgOf(container)).toBeInTheDocument();
  });

  it("passes className through to the rendered icon", () => {
    const { container } = render(<ModuleIcon name="Target" className="size-4 text-muted-foreground" />);

    expect(svgOf(container)!.classList.contains("size-4")).toBe(true);
  });
});
