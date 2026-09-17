import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("SITE_URL", () => {
  it("uses the configured public site URL when one is set", async () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://cofounderai.example");
    vi.resetModules();

    const { SITE_URL } = await import("./site");

    expect(SITE_URL).toBe("https://cofounderai.example");
  });

  it("falls back to localhost when the variable is unset", async () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", undefined);
    vi.resetModules();

    const { SITE_URL } = await import("./site");

    expect(SITE_URL).toBe("http://localhost:3000");
  });

  // apps/web/.env.example ships this key present-but-empty, so a deployment that copies
  // it verbatim sets "" rather than leaving it unset. That must still fall back, or every
  // canonical and Open Graph URL is built from an empty origin.
  it("falls back to localhost when the variable is present but empty", async () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "");
    vi.resetModules();

    const { SITE_URL } = await import("./site");

    expect(SITE_URL).toBe("http://localhost:3000");
  });
});
