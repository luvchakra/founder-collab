// @vitest-environment jsdom
/**
 * The auth screens are two routes rendered as one toggle, sharing a single form
 * component whose mode changes more than the button label: signup adds the name field,
 * enforces the 8-character minimum, and sends Google OAuth to /onboarding instead of
 * /dashboard, while login is the only mode that offers the password-reset link. Each of
 * those is a place the two modes could silently converge.
 */
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthActionState } from "@/app/(auth)/actions";

const h = vi.hoisted(() => ({
  usePathname: vi.fn<() => string>(),
  signInWithGoogle: vi.fn<(next: string) => Promise<void>>(),
  requestPasswordReset: vi.fn<(prev: AuthActionState, formData: FormData) => Promise<AuthActionState>>(),
  updatePassword: vi.fn<(prev: AuthActionState, formData: FormData) => Promise<AuthActionState>>(),
}));

vi.mock("next/navigation", () => ({ usePathname: h.usePathname }));
vi.mock("@/app/(auth)/actions", () => ({
  signInWithGoogle: h.signInWithGoogle,
  requestPasswordReset: h.requestPasswordReset,
  updatePassword: h.updatePassword,
}));

const { AuthForm } = await import("./auth-form");
const { AuthTabs } = await import("./auth-tabs");
const { ForgotPasswordForm } = await import("./forgot-password-form");
const { ResetPasswordForm } = await import("./reset-password-form");

const action = vi.fn<(prev: AuthActionState, formData: FormData) => Promise<AuthActionState>>();

beforeEach(() => {
  vi.resetAllMocks();
  action.mockResolvedValue(null);
  h.signInWithGoogle.mockResolvedValue(undefined);
  h.requestPasswordReset.mockResolvedValue(null);
  h.updatePassword.mockResolvedValue(null);
  h.usePathname.mockReturnValue("/login");
});

afterEach(cleanup);

describe("AuthTabs", () => {
  it("highlights Log In on the login route", () => {
    render(<AuthTabs />);

    expect(screen.getByRole("link", { name: "Log In" })).toHaveClass("bg-landing-accent");
    expect(screen.getByRole("link", { name: "Sign Up" })).not.toHaveClass("bg-landing-accent");
  });

  it("highlights Sign Up on the signup route", () => {
    h.usePathname.mockReturnValue("/signup");
    render(<AuthTabs />);

    expect(screen.getByRole("link", { name: "Sign Up" })).toHaveClass("bg-landing-accent");
    expect(screen.getByRole("link", { name: "Log In" })).not.toHaveClass("bg-landing-accent");
  });

  it("links both tabs at their own routes", () => {
    render(<AuthTabs />);

    expect(screen.getByRole("link", { name: "Log In" })).toHaveAttribute("href", "/login");
    expect(screen.getByRole("link", { name: "Sign Up" })).toHaveAttribute("href", "/signup");
  });
});

describe("AuthForm — login mode", () => {
  it("asks only for email and password, offering the reset link", () => {
    render(<AuthForm mode="login" action={action} />);

    expect(screen.queryByLabelText("Name")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Password")).toHaveAttribute("autocomplete", "current-password");
    expect(screen.getByLabelText("Password")).not.toHaveAttribute("minlength");
    expect(screen.getByRole("link", { name: "Forgot password?" })).toHaveAttribute(
      "href",
      "/forgot-password",
    );
    expect(screen.getByRole("button", { name: "Log In" })).toBeInTheDocument();
  });

  it("points a visitor without an account at signup", () => {
    render(<AuthForm mode="login" action={action} />);

    expect(screen.getByRole("link", { name: "Create your account →" })).toHaveAttribute(
      "href",
      "/signup",
    );
  });

  it("submits the credentials", async () => {
    const u = userEvent.setup();
    render(<AuthForm mode="login" action={action} />);

    await u.type(screen.getByLabelText("Email"), "ada@example.com");
    await u.type(screen.getByLabelText("Password"), "hunter2hunter2");
    await u.click(screen.getByRole("button", { name: "Log In" }));

    await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
    const formData = action.mock.calls[0]![1];
    expect(formData.get("email")).toBe("ada@example.com");
    expect(formData.get("password")).toBe("hunter2hunter2");
  });

  it("sends Google sign-in back to the dashboard", async () => {
    const u = userEvent.setup();
    render(<AuthForm mode="login" action={action} />);

    await u.click(screen.getByRole("button", { name: "Continue with Google" }));

    // bound to its `next` argument, so React appends the form's own FormData after it
    await waitFor(() => expect(h.signInWithGoogle).toHaveBeenCalledTimes(1));
    expect(h.signInWithGoogle.mock.calls[0]![0]).toBe("/dashboard");
  });

  it("shows the action's error and leaves the form usable", async () => {
    const u = userEvent.setup();
    action.mockResolvedValue({ error: "Invalid login credentials." });
    render(<AuthForm mode="login" action={action} />);

    await u.type(screen.getByLabelText("Email"), "ada@example.com");
    await u.type(screen.getByLabelText("Password"), "wrong");
    await u.click(screen.getByRole("button", { name: "Log In" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Invalid login credentials.");
    expect(screen.getByRole("button", { name: "Log In" })).toBeEnabled();
  });

  it("disables the submit button while signing in", async () => {
    const u = userEvent.setup();
    let release: (value: AuthActionState) => void = () => {};
    action.mockReturnValue(
      new Promise((resolve) => {
        release = resolve;
      }),
    );
    render(<AuthForm mode="login" action={action} />);

    await u.type(screen.getByLabelText("Email"), "ada@example.com");
    await u.type(screen.getByLabelText("Password"), "hunter2hunter2");
    await u.click(screen.getByRole("button", { name: "Log In" }));

    expect(await screen.findByRole("button", { name: "Please wait…" })).toBeDisabled();
    release({ error: "nope" });
    await screen.findByRole("alert");
  });
});

describe("AuthForm — signup mode", () => {
  it("collects a name and enforces the password minimum", () => {
    render(<AuthForm mode="signup" action={action} />);

    expect(screen.getByLabelText("Name")).toHaveAttribute("name", "name");
    expect(screen.getByLabelText("Password")).toHaveAttribute("minlength", "8");
    expect(screen.getByLabelText("Password")).toHaveAttribute("autocomplete", "new-password");
    expect(screen.queryByRole("link", { name: "Forgot password?" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create Account" })).toBeInTheDocument();
  });

  it("points an existing user at login", () => {
    render(<AuthForm mode="signup" action={action} />);

    expect(screen.getByRole("link", { name: "Log in →" })).toHaveAttribute("href", "/login");
  });

  it("submits the name alongside the credentials", async () => {
    const u = userEvent.setup();
    render(<AuthForm mode="signup" action={action} />);

    await u.type(screen.getByLabelText("Name"), "Ada Lovelace");
    await u.type(screen.getByLabelText("Email"), "ada@example.com");
    await u.type(screen.getByLabelText("Password"), "hunter2hunter2");
    await u.click(screen.getByRole("button", { name: "Create Account" }));

    await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
    expect(action.mock.calls[0]![1].get("name")).toBe("Ada Lovelace");
  });

  it("sends Google sign-up into onboarding, not the dashboard", async () => {
    const u = userEvent.setup();
    render(<AuthForm mode="signup" action={action} />);

    await u.click(screen.getByRole("button", { name: "Continue with Google" }));

    await waitFor(() => expect(h.signInWithGoogle).toHaveBeenCalledTimes(1));
    expect(h.signInWithGoogle.mock.calls[0]![0]).toBe("/onboarding");
  });
});

describe("ForgotPasswordForm", () => {
  it("asks for the email and requests the reset link", async () => {
    const u = userEvent.setup();
    render(<ForgotPasswordForm />);

    await u.type(screen.getByLabelText("Email"), "ada@example.com");
    await u.click(screen.getByRole("button", { name: "Send reset link" }));

    await waitFor(() => expect(h.requestPasswordReset).toHaveBeenCalledTimes(1));
    expect(h.requestPasswordReset.mock.calls[0]![1].get("email")).toBe("ada@example.com");
  });

  it("reports a failure as an alert", async () => {
    const u = userEvent.setup();
    h.requestPasswordReset.mockResolvedValue({ error: "We couldn't send that reset link." });
    render(<ForgotPasswordForm />);

    await u.type(screen.getByLabelText("Email"), "ada@example.com");
    await u.click(screen.getByRole("button", { name: "Send reset link" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("We couldn't send that reset link.");
  });
});

describe("ResetPasswordForm", () => {
  it("requires the new password twice, both at the 8-character minimum", () => {
    render(<ResetPasswordForm />);

    for (const label of ["New password", "Confirm new password"]) {
      const field = screen.getByLabelText(label);
      expect(field).toHaveAttribute("type", "password");
      expect(field).toHaveAttribute("minlength", "8");
      expect(field).toBeRequired();
    }
  });

  it("submits both fields so the action can compare them", async () => {
    const u = userEvent.setup();
    render(<ResetPasswordForm />);

    await u.type(screen.getByLabelText("New password"), "hunter2hunter2");
    await u.type(screen.getByLabelText("Confirm new password"), "hunter2hunter2");
    await u.click(screen.getByRole("button", { name: "Save new password" }));

    await waitFor(() => expect(h.updatePassword).toHaveBeenCalledTimes(1));
    const formData = h.updatePassword.mock.calls[0]![1];
    expect(formData.get("password")).toBe("hunter2hunter2");
    expect(formData.get("confirmPassword")).toBe("hunter2hunter2");
  });

  it("reports a mismatch from the action", async () => {
    const u = userEvent.setup();
    h.updatePassword.mockResolvedValue({ error: "Passwords do not match." });
    render(<ResetPasswordForm />);

    await u.type(screen.getByLabelText("New password"), "hunter2hunter2");
    await u.type(screen.getByLabelText("Confirm new password"), "hunter2hunter3");
    await u.click(screen.getByRole("button", { name: "Save new password" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Passwords do not match.");
  });
});
