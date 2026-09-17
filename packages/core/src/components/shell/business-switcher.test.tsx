// @vitest-environment jsdom
/**
 * The topbar's business picker. It is the only always-visible way to change tenant, so
 * the two states worth pinning are the ones a founder meets before they have any data —
 * no business selected yet (the trigger must still say something) and no businesses at
 * all (the menu must offer creation rather than an empty box).
 */
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BusinessSwitcher } from "./business-switcher";

const BUSINESSES = [
  { id: "biz-1", name: "Acme Co" },
  { id: "biz-2", name: "Initech", description: "Invoice software" },
];

function renderSwitcher(props: Partial<Parameters<typeof BusinessSwitcher>[0]> = {}) {
  const onCreateBusiness = vi.fn();
  render(
    <BusinessSwitcher
      businesses={BUSINESSES}
      activeBusinessId="biz-1"
      businessHref={(id) => `/dashboard/businesses/${id}`}
      onCreateBusiness={onCreateBusiness}
      {...props}
    />,
  );
  return { onCreateBusiness };
}

/** Opens from the keyboard: the pointer path leaves global layer state behind in jsdom
 * that blocks the next test in this file from opening at all. */
async function open(name: RegExp | string) {
  const trigger = screen.getByRole("button", { name });
  trigger.focus();
  fireEvent.keyDown(trigger, { key: "Enter" });
  return userEvent.setup({ pointerEventsCheck: 0 });
}

afterEach(() => {
  // Close any menu left open: radix tracks open layers globally, and unmounting while a
  // menu is still open leaves the next test's trigger behind a stale dismissable layer.
  fireEvent.keyDown(document, { key: "Escape" });
  cleanup();
  document.body.style.pointerEvents = "";
});

describe("BusinessSwitcher", () => {
  it("names the active business on the trigger", () => {
    renderSwitcher();

    expect(screen.getByRole("button", { name: /Acme Co/ })).toBeInTheDocument();
  });

  it("prompts for a choice when no business is active yet", () => {
    renderSwitcher({ activeBusinessId: null });

    expect(screen.getByRole("button", { name: /Select Business/ })).toBeInTheDocument();
  });

  it("lists every business, linked and with its description", async () => {
    renderSwitcher();
    await open(/Acme Co/);

    expect(await screen.findByRole("menuitem", { name: /Acme Co/ })).toHaveAttribute(
      "href",
      "/dashboard/businesses/biz-1",
    );
    expect(screen.getByRole("menuitem", { name: /Initech/ })).toHaveTextContent(
      "Initech - Invoice software",
    );
  });

  it("offers creation instead of an empty menu when the account has no businesses", async () => {
      renderSwitcher({ businesses: [], activeBusinessId: null });
    await open(/Select Business/);

    expect(await screen.findByText("No businesses yet.")).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /Create New Business/ })).toBeInTheDocument();
  });

  it("asks the caller to open its own create flow", async () => {
    const { onCreateBusiness } = renderSwitcher();
    const u = await open(/Acme Co/);

    await u.click(await screen.findByRole("menuitem", { name: /Create New Business/ }));

    expect(onCreateBusiness).toHaveBeenCalledOnce();
  });
});
