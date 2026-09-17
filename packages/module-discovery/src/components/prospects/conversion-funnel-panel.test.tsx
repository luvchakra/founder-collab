// @vitest-environment jsdom
/**
 * The funnel is shared by the per-product Conversions tab and the account-wide dashboard
 * so both compute and look identically. Its own arithmetic is the per-stage bar widths
 * and step-over-step rates — and the "customers (won)" KPI, which is deliberately
 * separate from the funnel's "closed" stage: a closed conversation says nothing about
 * whether the deal was won.
 */
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ConversionFunnelPanel } from "./conversion-funnel-panel";

const FUNNEL = {
  total: 10,
  replyRate: 30,
  closeRate: 10,
  steps: [
    { stage: "new", label: "Added", reached: 10 },
    { stage: "researched", label: "Researched", reached: 5 },
    { stage: "sent", label: "Contacted", reached: 2 },
  ],
} as unknown as Parameters<typeof ConversionFunnelPanel>[0]["funnel"];

afterEach(cleanup);

describe("ConversionFunnelPanel", () => {
  it("shows the four KPIs", () => {
    render(<ConversionFunnelPanel funnel={FUNNEL} wonCount={3} />);

    expect(screen.getByText("Total prospects").nextElementSibling).toHaveTextContent("10");
    expect(screen.getByText("Reply rate").nextElementSibling).toHaveTextContent("30%");
    expect(screen.getByText("Customers (won)").nextElementSibling).toHaveTextContent("3");
    expect(screen.getByText("Overall conversion").nextElementSibling).toHaveTextContent("10%");
  });

  it("defaults the won count to zero when the caller has none to pass", () => {
    render(<ConversionFunnelPanel funnel={FUNNEL} />);

    expect(screen.getByText("Customers (won)").nextElementSibling).toHaveTextContent("0");
  });

  it("lists every stage with its reached count", () => {
    render(<ConversionFunnelPanel funnel={FUNNEL} wonCount={0} />);

    for (const label of ["Added", "Researched", "Contacted"]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it("sizes each bar as a share of the total", () => {
    const { container } = render(<ConversionFunnelPanel funnel={FUNNEL} />);

    const bars = [...container.querySelectorAll<HTMLElement>(".bg-primary")];
    expect(bars.map((b) => b.style.width)).toEqual(["100%", "50%", "20%"]);
  });

  it("shows the step-over-step rate for every stage but the first", () => {
    render(<ConversionFunnelPanel funnel={FUNNEL} />);

    expect(screen.getByText("50% of prev")).toBeInTheDocument();
    expect(screen.getByText("40% of prev")).toBeInTheDocument();
    expect(screen.queryByText("100% of prev")).not.toBeInTheDocument();
  });

  it("prompts for prospects instead of drawing an empty funnel", () => {
    render(
      <ConversionFunnelPanel
        funnel={{ ...FUNNEL, total: 0, steps: [] } as unknown as typeof FUNNEL}
      />,
    );

    expect(screen.getByText(/Add prospects to see your conversion funnel/)).toBeInTheDocument();
  });

  it("does not divide by zero when a stage reached nobody", () => {
    render(
      <ConversionFunnelPanel
        funnel={{
          ...FUNNEL,
          steps: [
            { stage: "new", label: "Added", reached: 0 },
            { stage: "researched", label: "Researched", reached: 0 },
          ],
        } as unknown as typeof FUNNEL}
      />,
    );

    expect(screen.getByText("0% of prev")).toBeInTheDocument();
  });
});
