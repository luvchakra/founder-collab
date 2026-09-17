// @vitest-environment jsdom
/**
 * Email is deliberately shown as a disabled, un-named field: it identifies the account
 * and is changed through Supabase auth, not this form, so it must never ride along in the
 * submitted FormData. The rest is uncontrolled (defaultValue) so a re-render from the
 * action's returned state can't wipe what the user typed.
 */
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RenameActionState } from "@cofounderai/module-discovery/lib/tenancy/types";
import { ProfileForm } from "./profile-form";

const action = vi.fn<(prev: RenameActionState, formData: FormData) => Promise<RenameActionState>>();

function renderForm() {
  return render(
    <ProfileForm
      defaultFullName="Ada Lovelace"
      defaultBio="Building things"
      defaultPhone="+91 99999 99999"
      email="ada@example.com"
      action={action}
    />,
  );
}

beforeEach(() => {
  vi.resetAllMocks();
  action.mockResolvedValue(null);
});

afterEach(cleanup);

describe("ProfileForm", () => {
  it("shows the account email as read-only and outside the submitted data", async () => {
    const u = userEvent.setup();
    renderForm();

    const email = screen.getByLabelText("Email");
    expect(email).toBeDisabled();
    expect(email).not.toHaveAttribute("name");

    await u.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
    expect(action.mock.calls[0]![1].get("email")).toBeNull();
  });

  it("pre-fills the editable fields and submits the edits", async () => {
    const u = userEvent.setup();
    renderForm();

    expect(screen.getByLabelText("Name")).toHaveValue("Ada Lovelace");
    expect(screen.getByLabelText("Phone")).toHaveValue("+91 99999 99999");
    expect(screen.getByLabelText("Bio")).toHaveValue("Building things");

    await u.clear(screen.getByLabelText("Name"));
    await u.type(screen.getByLabelText("Name"), "Ada L");
    await u.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
    const formData = action.mock.calls[0]![1];
    expect(formData.get("fullName")).toBe("Ada L");
    expect(formData.get("phone")).toBe("+91 99999 99999");
    expect(formData.get("bio")).toBe("Building things");
  });

  it("confirms a successful save", async () => {
    const u = userEvent.setup();
    action.mockResolvedValue({ success: true });
    renderForm();

    await u.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("Saved.")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("surfaces a returned error without clearing the form", async () => {
    const u = userEvent.setup();
    action.mockResolvedValue({ error: "Name is required." });
    renderForm();

    await u.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Name is required.");
    expect(screen.getByLabelText("Name")).toHaveValue("Ada Lovelace");
    expect(screen.queryByText("Saved.")).not.toBeInTheDocument();
  });

  it("shows the pending label while the save is in flight", async () => {
    const u = userEvent.setup();
    let release: (value: RenameActionState) => void = () => {};
    action.mockReturnValue(
      new Promise((resolve) => {
        release = resolve;
      }),
    );
    renderForm();

    await u.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByRole("button", { name: "Saving..." })).toBeDisabled();
    release({ success: true });
    await screen.findByText("Saved.");
  });
});
