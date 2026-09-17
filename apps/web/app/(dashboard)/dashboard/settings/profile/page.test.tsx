// @vitest-environment jsdom
/**
 * Profile settings read entirely from the auth user's metadata, which is shaped
 * differently depending on how the account was created: an email signup stores
 * `full_name`, Google OAuth stores `name` and `picture`. The page normalises both before
 * the forms see them.
 */
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  createClient: vi.fn(),
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
}));

vi.mock("next/navigation", () => ({ redirect: h.redirect }));
vi.mock("@cofounderai/core/db/server", () => ({ createClient: h.createClient }));
vi.mock("./actions", () => ({ updateAvatarAction: vi.fn(), updateProfileAction: vi.fn() }));

const { default: ProfilePage } = await import("./page");

function mockUser(user: unknown) {
  h.createClient.mockResolvedValue({ auth: { getUser: async () => ({ data: { user } }) } });
}

const renderPage = () => ProfilePage().then(render);

beforeEach(() => {
  vi.clearAllMocks();
  mockUser({
    id: "u1",
    email: "ada@example.com",
    user_metadata: { full_name: "Ada Lovelace", bio: "Building things", phone: "+91 99999 99999" },
  });
});

afterEach(cleanup);

describe("ProfilePage", () => {
  it("sends a signed-out visitor to login", async () => {
    mockUser(null);

    await expect(renderPage()).rejects.toThrow("NEXT_REDIRECT:/login");
  });

  it("fills the form from an email-signup profile", async () => {
    await renderPage();

    expect(screen.getByLabelText("Name")).toHaveValue("Ada Lovelace");
    expect(screen.getByLabelText("Bio")).toHaveValue("Building things");
    expect(screen.getByLabelText("Phone")).toHaveValue("+91 99999 99999");
    expect(screen.getByLabelText("Email")).toHaveValue("ada@example.com");
  });

  it("reads Google's own metadata keys when that is how the account was created", async () => {
    mockUser({
      id: "u1",
      email: "ada@example.com",
      user_metadata: { name: "Ada", picture: "https://lh3/ada" },
    });

    const { container } = await renderPage();

    expect(screen.getByLabelText("Name")).toHaveValue("Ada");
    expect(container.querySelector("img")).toHaveAttribute("src", "https://lh3/ada");
  });

  it("prefers an uploaded avatar over the OAuth picture", async () => {
    mockUser({
      id: "u1",
      email: "ada@example.com",
      user_metadata: { avatar_url: "https://cdn.example/ada.png", picture: "https://lh3/ada" },
    });

    const { container } = await renderPage();

    expect(container.querySelector("img")).toHaveAttribute("src", "https://cdn.example/ada.png");
  });

  it("falls back to initials and empty fields for a bare account", async () => {
    mockUser({ id: "u1", email: "ada@example.com", user_metadata: {} });

    const { container } = await renderPage();

    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByText("AD")).toBeInTheDocument();
    expect(screen.getByLabelText("Name")).toHaveValue("");
    expect(screen.getByLabelText("Bio")).toHaveValue("");
  });

  it("survives a user row carrying no metadata at all", async () => {
    mockUser({ id: "u1", email: "ada@example.com" });

    await renderPage();

    expect(screen.getByLabelText("Name")).toHaveValue("");
  });
});
