// @vitest-environment jsdom
/**
 * The avatar is rendered with a plain <img> on purpose (avatar_url can be Google's
 * profile-photo host, which next/image isn't configured for), and the local preview is
 * an object URL created the moment a file is chosen — so "picked a file" must show that
 * preview instead of the stored avatar, and an account with neither falls back to
 * initials derived from the name, or from the email when there is no name.
 */
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RenameActionState } from "@cofounderai/module-discovery/lib/tenancy/types";
import { AvatarUploadForm } from "./avatar-upload-form";

const action = vi.fn<(prev: RenameActionState, formData: FormData) => Promise<RenameActionState>>();

function renderForm(props: Partial<Parameters<typeof AvatarUploadForm>[0]> = {}) {
  return render(
    <AvatarUploadForm
      avatarUrl={null}
      name="Ada Lovelace"
      email="ada@example.com"
      action={action}
      {...props}
    />,
  );
}

const file = () => new File([new Uint8Array([1, 2, 3])], "me.png", { type: "image/png" });
const fileInput = () => document.querySelector('input[type="file"]') as HTMLInputElement;

beforeEach(() => {
  vi.resetAllMocks();
  action.mockResolvedValue(null);
  vi.stubGlobal("URL", { ...URL, createObjectURL: vi.fn(() => "blob:preview") });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("AvatarUploadForm — fallback initials", () => {
  it("uses both initials of a full name", () => {
    renderForm();
    expect(screen.getByText("AL")).toBeInTheDocument();
  });

  it("uses the first two letters of a single-word name", () => {
    renderForm({ name: "ada" });
    expect(screen.getByText("AD")).toBeInTheDocument();
  });

  it("falls back to the email when there is no name at all", () => {
    renderForm({ name: null });
    expect(screen.getByText("AD")).toBeInTheDocument();
  });

  it("falls back to the email when the name is only whitespace", () => {
    renderForm({ name: "   ", email: "zoe@example.com" });
    expect(screen.getByText("ZO")).toBeInTheDocument();
  });
});

describe("AvatarUploadForm", () => {
  it("shows the stored avatar instead of initials when there is one", () => {
    const { container } = renderForm({ avatarUrl: "https://lh3.example/photo.jpg" });

    const img = container.querySelector("img")!;
    expect(img).toHaveAttribute("src", "https://lh3.example/photo.jpg");
    // decorative: the surrounding form already names the control
    expect(img).toHaveAttribute("alt", "");
    expect(screen.queryByText("AL")).not.toBeInTheDocument();
  });

  it("accepts only image types", () => {
    renderForm();
    expect(fileInput()).toHaveAttribute("accept", "image/png,image/jpeg,image/webp,image/gif");
    expect(fileInput()).toHaveAttribute("name", "avatar");
  });

  it("previews the chosen file over the stored avatar", async () => {
    const u = userEvent.setup();
    const { container } = renderForm({ avatarUrl: "https://lh3.example/photo.jpg" });

    await u.upload(fileInput(), file());

    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
    expect(container.querySelector("img")).toHaveAttribute("src", "blob:preview");
  });

  it("leaves the initials alone when the picker is dismissed without a file", async () => {
    const { container } = renderForm();

    // userEvent.upload with no files is a no-op, so fire the change the browser would
    fireEvent.change(fileInput(), { target: { files: [] } });

    expect(URL.createObjectURL).not.toHaveBeenCalled();
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByText("AL")).toBeInTheDocument();
  });

  it("submits the chosen file under the name the action reads", async () => {
    const u = userEvent.setup();
    renderForm();

    await u.upload(fileInput(), file());
    expect(fileInput().files![0]!.name).toBe("me.png");

    await u.click(screen.getByRole("button", { name: "Upload avatar" }));

    await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
    // jsdom serialises a file input to an empty File rather than the selected one, so
    // this can only assert the field is carried, not its bytes -- the action's own tests
    // (app/(dashboard)/dashboard/settings/profile/actions.test.ts) cover the upload.
    expect(action.mock.calls[0]![1].get("avatar")).toBeInstanceOf(File);
  });

  it("reports a rejected upload", async () => {
    const u = userEvent.setup();
    action.mockResolvedValue({ error: "That image is too large." });
    renderForm();

    await u.upload(fileInput(), file());
    await u.click(screen.getByRole("button", { name: "Upload avatar" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("That image is too large.");
  });

  it("shows an uploading state while the action runs", async () => {
    const u = userEvent.setup();
    let release: (value: RenameActionState) => void = () => {};
    action.mockReturnValue(
      new Promise((resolve) => {
        release = resolve;
      }),
    );
    renderForm();

    await u.upload(fileInput(), file());
    await u.click(screen.getByRole("button", { name: "Upload avatar" }));

    expect(await screen.findByRole("button", { name: "Uploading..." })).toBeDisabled();
    release({ error: "nope" });
    await screen.findByRole("alert");
  });
});
