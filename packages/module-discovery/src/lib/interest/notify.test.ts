/**
 * The founder notification runs *after* the visitor's signup is already recorded, so its
 * contract is that it never throws: a failure here must not turn a successful signup into
 * a visitor-facing error. Both failure modes — unconfigured provider, failed send — are
 * therefore tested for silence plus a server-side log.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { send, Resend } = vi.hoisted(() => ({ send: vi.fn(), Resend: vi.fn() }));
vi.mock("resend", () => ({ Resend }));

const { notifyInterestSignup } = await import("./notify");

let consoleError: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.clearAllMocks();
  send.mockResolvedValue({ error: null });
  // `new Resend(...)`: vitest requires a `class` implementation for a mock invoked with
  // `new` — neither an arrow implementation nor mockReturnValue is constructible.
  Resend.mockImplementation(
    class {
      emails = { send };
    },
  );
  vi.stubEnv("RESEND_API_KEY", "re_key");
  vi.stubEnv("RESEND_FROM_EMAIL", "hello@cofounderai.example");
  consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  consoleError.mockRestore();
});

describe("notifyInterestSignup", () => {
  it("sends the notification from the configured address", async () => {
    await notifyInterestSignup("visitor@example.com");

    expect(Resend).toHaveBeenCalledWith("re_key");
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({ from: "hello@cofounderai.example", subject: expect.any(String) }),
    );
  });

  it("includes the signup address in the body", async () => {
    await notifyInterestSignup("visitor@example.com");

    expect(send.mock.calls[0]![0].text).toContain("visitor@example.com");
  });

  it.each([
    ["no API key", "RESEND_API_KEY"],
    ["no from address", "RESEND_FROM_EMAIL"],
  ])("skips silently with %s configured, logging instead", async (_label, missing) => {
    vi.stubEnv(missing, "");

    await expect(notifyInterestSignup("visitor@example.com")).resolves.toBeUndefined();

    expect(send).not.toHaveBeenCalled();
    expect(consoleError).toHaveBeenCalled();
  });

  it("logs, but does not throw, when the provider reports a send failure", async () => {
    send.mockResolvedValue({ error: { message: "domain not verified" } });

    await expect(notifyInterestSignup("visitor@example.com")).resolves.toBeUndefined();

    expect(consoleError).toHaveBeenCalledWith(
      expect.stringContaining("failed to send"),
      expect.anything(),
    );
  });

  it("never logs the API key", async () => {
    send.mockResolvedValue({ error: { message: "nope" } });

    await notifyInterestSignup("visitor@example.com");

    expect(JSON.stringify(consoleError.mock.calls)).not.toContain("re_key");
  });
});
