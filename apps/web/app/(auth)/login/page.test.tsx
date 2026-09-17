// @vitest-environment jsdom
/**
 * Login's own page is thin — the form does the work — but it is the landing spot for the
 * OAuth callback's failure redirect, so an `error` query param has to surface as an
 * alert rather than being swallowed.
 */
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/(auth)/actions", () => ({ login: vi.fn(), signInWithGoogle: vi.fn() }));

const { default: LoginPage } = await import("./page");

const renderPage = (searchParams: { error?: string } = {}) =>
  LoginPage({ searchParams: Promise.resolve(searchParams) }).then(render);

afterEach(cleanup);

describe("LoginPage", () => {
  it("welcomes a returning founder and renders the login form", async () => {
    await renderPage();

    expect(screen.getByRole("heading", { name: "Welcome back, Founder." })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Log In" })).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("surfaces an error handed back by the auth callback", async () => {
    await renderPage({ error: "Could not sign you in with Google." });

    expect(await screen.findByRole("alert")).toHaveTextContent("Could not sign you in with Google.");
  });
});
