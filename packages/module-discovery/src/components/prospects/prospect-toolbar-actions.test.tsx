// @vitest-environment jsdom
/**
 * The prospects toolbar: two links out to the bulk paths and one in-place modal. The
 * modal is the part worth pinning — it must not be mounted until asked for (it traps
 * focus and covers the list), and closing it must unmount it rather than leave it hidden.
 */
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProspectToolbarActions } from "./prospect-toolbar-actions";

const createAction = vi.fn<(formData: FormData) => Promise<void>>();

function renderToolbar() {
  return render(
    <ProspectToolbarActions
      importHref="/prospects/import"
      discoverHref="/prospects/discover"
      createAction={createAction}
    />,
  );
}

afterEach(cleanup);

describe("ProspectToolbarActions", () => {
  it("links out to CSV import and AI discovery", () => {
    renderToolbar();

    expect(screen.getByRole("link", { name: /Import CSV/ })).toHaveAttribute(
      "href",
      "/prospects/import",
    );
    expect(screen.getByRole("link", { name: /Discover/ })).toHaveAttribute(
      "href",
      "/prospects/discover",
    );
  });

  it("keeps the add-prospect modal unmounted until it is asked for", () => {
    renderToolbar();

    expect(screen.getByRole("button", { name: /Add/ })).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("opens the modal on Add and closes it again", async () => {
    const u = userEvent.setup();
    renderToolbar();

    await u.click(screen.getByRole("button", { name: /Add/ }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    await u.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
