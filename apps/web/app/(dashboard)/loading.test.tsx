// @vitest-environment jsdom
/**
 * Next's loading convention: this is what fills the dashboard's content area while a page
 * below the shell fetches, so it must say something rather than flashing an empty frame.
 */
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import DashboardLoading from "./loading";

afterEach(cleanup);

describe("DashboardLoading", () => {
  it("shows a spinner and a label", () => {
    const { container } = render(<DashboardLoading />);

    expect(screen.getByText("Loading…")).toBeInTheDocument();
    expect(container.querySelector(".animate-spin")).not.toBeNull();
  });
});
