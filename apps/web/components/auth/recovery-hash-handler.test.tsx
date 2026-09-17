// @vitest-environment jsdom
/**
 * The fragment is the one part of a recovery link the server can never see, so this
 * component is the only thing standing between a working link and a founder being told it
 * expired. Two properties matter beyond that: the tokens are stripped from the address bar
 * as soon as they are read — they would otherwise sit in browser history — and the page's
 * "expired" copy is withheld until there is genuinely nothing to consume.
 */
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  createClient: vi.fn(),
  setSession: vi.fn(),
  refresh: vi.fn(),
  replace: vi.fn(),
}));

vi.mock("@cofounderai/core/db/client", () => ({ createClient: h.createClient }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: h.refresh, replace: h.replace }),
}));

const { RecoveryHashHandler } = await import("./recovery-hash-handler");

const EXPIRED = <p>This reset link is invalid or has expired.</p>;

function visitWithHash(hash: string) {
  window.history.replaceState(null, "", `/reset-password${hash}`);
}

beforeEach(() => {
  vi.clearAllMocks();
  h.setSession.mockResolvedValue({ error: null });
  h.createClient.mockReturnValue({ auth: { setSession: h.setSession } });
  visitWithHash("");
});

afterEach(cleanup);

describe("RecoveryHashHandler — a link with tokens in the fragment", () => {
  it("opens the session from the fragment and re-renders the page for the form", async () => {
    visitWithHash("#access_token=at-123&refresh_token=rt-456&type=recovery");

    render(<RecoveryHashHandler>{EXPIRED}</RecoveryHashHandler>);

    await waitFor(() =>
      expect(h.setSession).toHaveBeenCalledWith({
        access_token: "at-123",
        refresh_token: "rt-456",
      }),
    );
    await waitFor(() => expect(h.refresh).toHaveBeenCalledOnce());
  });

  it("never shows the expired copy for a link that works", async () => {
    visitWithHash("#access_token=at-123&refresh_token=rt-456&type=recovery");

    render(<RecoveryHashHandler>{EXPIRED}</RecoveryHashHandler>);

    expect(screen.queryByText(/invalid or has expired/)).not.toBeInTheDocument();
    expect(await screen.findByText("Checking your reset link...")).toBeInTheDocument();
  });

  it("strips the tokens out of the address bar as soon as it has read them", async () => {
    visitWithHash("#access_token=at-123&refresh_token=rt-456&type=recovery");

    render(<RecoveryHashHandler>{EXPIRED}</RecoveryHashHandler>);

    await waitFor(() => expect(window.location.hash).toBe(""));
    expect(window.location.pathname).toBe("/reset-password");
  });

  it("sends a rejected session back to request a fresh link", async () => {
    visitWithHash("#access_token=at-123&refresh_token=rt-456&type=recovery");
    h.setSession.mockResolvedValue({ error: { message: "Invalid refresh token" } });

    render(<RecoveryHashHandler>{EXPIRED}</RecoveryHashHandler>);

    await waitFor(() =>
      expect(h.replace).toHaveBeenCalledWith("/forgot-password?error=Invalid%20refresh%20token"),
    );
    expect(h.refresh).not.toHaveBeenCalled();
  });
});

describe("RecoveryHashHandler — a link that carries no session", () => {
  it("shows the page's own expired copy when there is no fragment at all", async () => {
    render(<RecoveryHashHandler>{EXPIRED}</RecoveryHashHandler>);

    expect(await screen.findByText(/invalid or has expired/)).toBeInTheDocument();
    expect(h.createClient).not.toHaveBeenCalled();
  });

  it("does the same for a fragment with no tokens in it", async () => {
    visitWithHash("#type=recovery");

    render(<RecoveryHashHandler>{EXPIRED}</RecoveryHashHandler>);

    expect(await screen.findByText(/invalid or has expired/)).toBeInTheDocument();
    expect(h.setSession).not.toHaveBeenCalled();
  });

  it("carries Supabase's own rejection to the page that can issue a new link", async () => {
    visitWithHash(
      "#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired",
    );

    render(<RecoveryHashHandler>{EXPIRED}</RecoveryHashHandler>);

    await waitFor(() =>
      expect(h.replace).toHaveBeenCalledWith(
        "/forgot-password?error=Email%20link%20is%20invalid%20or%20has%20expired",
      ),
    );
    expect(h.setSession).not.toHaveBeenCalled();
  });

  it("falls back to the bare error code when the fragment has no description", async () => {
    visitWithHash("#error=access_denied");

    render(<RecoveryHashHandler>{EXPIRED}</RecoveryHashHandler>);

    await waitFor(() =>
      expect(h.replace).toHaveBeenCalledWith("/forgot-password?error=access_denied"),
    );
  });

  it("clears an error fragment from the address bar too", async () => {
    visitWithHash("#error=access_denied");

    render(<RecoveryHashHandler>{EXPIRED}</RecoveryHashHandler>);

    await waitFor(() => expect(window.location.hash).toBe(""));
  });
});
