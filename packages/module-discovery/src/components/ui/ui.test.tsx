// @vitest-environment jsdom
/**
 * The module's own small presentational primitives. Each has exactly one behaviour worth
 * pinning — a disclosure that starts closed, a truncation that toggles, a "Show more"
 * that only appears when the content actually overflows — and each is used in enough
 * places that a regression would be felt broadly and diagnosed narrowly.
 */
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { CollapsibleCard } from "./collapsible-card";
import { ExpandableText } from "./expandable-text";
import { ExpandableBox } from "./expandable-box";
import { LoadingSkeleton } from "./loading-skeleton";
import { NativeSelect } from "./native-select";

afterEach(cleanup);

describe("CollapsibleCard", () => {
  it("starts closed, hiding its contents", () => {
    render(
      <CollapsibleCard label="Filters">
        <p>inner</p>
      </CollapsibleCard>,
    );

    expect(screen.queryByText("inner")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Filters/ })).toHaveAttribute("aria-expanded", "false");
  });

  it("opens and closes on the header", () => {
    render(
      <CollapsibleCard label="Filters">
        <p>inner</p>
      </CollapsibleCard>,
    );
    const toggle = screen.getByRole("button", { name: /Filters/ });

    fireEvent.click(toggle);
    expect(screen.getByText("inner")).toBeInTheDocument();

    fireEvent.click(toggle);
    expect(screen.queryByText("inner")).not.toBeInTheDocument();
  });

  it("can start open when asked", () => {
    render(
      <CollapsibleCard label="Filters" defaultOpen>
        <p>inner</p>
      </CollapsibleCard>,
    );

    expect(screen.getByText("inner")).toBeInTheDocument();
  });

  it("does not submit an enclosing form", () => {
    render(<CollapsibleCard label="Filters">x</CollapsibleCard>);

    expect(screen.getByRole("button")).toHaveAttribute("type", "button");
  });
});

describe("ExpandableText", () => {
  it("truncates until clicked, then shows the full text", () => {
    render(<ExpandableText text="a very long description" />);
    const toggle = screen.getByRole("button");

    expect(screen.getByText("a very long description").classList.contains("truncate")).toBe(true);

    fireEvent.click(toggle);
    expect(screen.getByText("a very long description").classList.contains("truncate")).toBe(false);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
  });

  it("collapses again on a second click", () => {
    render(<ExpandableText text="text" />);

    fireEvent.click(screen.getByRole("button"));
    fireEvent.click(screen.getByRole("button"));

    expect(screen.getByRole("button")).toHaveAttribute("aria-expanded", "false");
  });

  it("passes a className through to the control", () => {
    render(<ExpandableText text="text" className="w-40" />);

    expect(screen.getByRole("button").classList.contains("w-40")).toBe(true);
  });
});

describe("ExpandableBox", () => {
  /** jsdom reports scrollHeight as 0, so it is stubbed to simulate over/underflow. */
  function withScrollHeight(px: number) {
    Object.defineProperty(HTMLElement.prototype, "scrollHeight", {
      configurable: true,
      get: () => px,
    });
  }

  it("offers no Show more when the content fits", () => {
    withScrollHeight(100);

    render(
      <ExpandableBox>
        <p>short</p>
      </ExpandableBox>,
    );

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("offers Show more once the content overflows, and toggles it", () => {
    withScrollHeight(1000);

    render(
      <ExpandableBox>
        <p>long</p>
      </ExpandableBox>,
    );

    const toggle = screen.getByRole("button", { name: /Show more/ });
    fireEvent.click(toggle);
    expect(screen.getByRole("button", { name: /Show less/ })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Show less/ }));
    expect(screen.getByRole("button", { name: /Show more/ })).toBeInTheDocument();
  });

  it("measures against a custom collapsed height", () => {
    withScrollHeight(300);

    render(
      <ExpandableBox collapsedHeight={500}>
        <p>content</p>
      </ExpandableBox>,
    );

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("renders its children either way", () => {
    withScrollHeight(1000);

    render(
      <ExpandableBox>
        <p>content</p>
      </ExpandableBox>,
    );

    expect(screen.getByText("content")).toBeInTheDocument();
  });
});

describe("LoadingSkeleton", () => {
  it("renders pulsing placeholder bars", () => {
    const { container } = render(<LoadingSkeleton />);

    expect(container.querySelectorAll(".animate-pulse").length).toBeGreaterThan(1);
  });

  it("takes a className so it matches the page it stands in for", () => {
    const { container } = render(<LoadingSkeleton className="max-w-5xl" />);

    expect(container.firstElementChild!.classList.contains("max-w-5xl")).toBe(true);
  });
});

describe("NativeSelect", () => {
  it("renders a real <select>, which a plain GET form can submit", () => {
    render(
      <NativeSelect name="industry" defaultValue="mfg">
        <option value="mfg">Manufacturing</option>
        <option value="retail">Retail</option>
      </NativeSelect>,
    );

    const select = screen.getByRole("combobox");
    expect(select.tagName).toBe("SELECT");
    expect(select).toHaveAttribute("name", "industry");
    expect(select).toHaveValue("mfg");
  });

  it("forwards arbitrary select props", () => {
    render(
      <NativeSelect disabled>
        <option>a</option>
      </NativeSelect>,
    );

    expect(screen.getByRole("combobox")).toBeDisabled();
  });

  it("merges a custom className with its own", () => {
    render(
      <NativeSelect className="w-32">
        <option>a</option>
      </NativeSelect>,
    );

    expect(screen.getByRole("combobox").classList.contains("w-32")).toBe(true);
  });
});
