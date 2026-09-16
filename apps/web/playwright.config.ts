import { defineConfig, devices } from "@playwright/test";

/**
 * Critical-path smoke suite (docs/testing/e2e-playwright.md has the full rationale and
 * setup instructions). Supersedes docs/testing/TESTING_STRATEGY.md §5's earlier "hold
 * off on Playwright until the shell/navigation layer stops churning" note -- that
 * routing/rename churn is done (business-slug routing, module URL renames), so this is
 * the point that note itself said to revisit it.
 *
 * This suite needs a real, reachable Supabase project (the same one `next dev` already
 * points NEXT_PUBLIC_SUPABASE_URL/NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY at) and a real
 * signed-in test account -- it exercises real authorization and real data, never
 * UI-only checks (CLAUDE.md's own "use real authorization... do not fake security
 * behavior with UI-only checks" principle applies just as much to the tests as the app).
 * It will not run anywhere that can't reach that Supabase project.
 */
const PORT = process.env.PLAYWRIGHT_PORT ?? "3100";
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? `http://localhost:${PORT}`;
const isCI = Boolean(process.env.CI);

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  workers: isCI ? 2 : undefined,
  reporter: isCI ? [["list"], ["html", { open: "never" }]] : "list",
  timeout: 30_000,
  expect: { timeout: 10_000 },

  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    // Escape hatch for a sandboxed/offline environment that already has a Chromium
    // binary pre-baked at a nonstandard path and can't reach the network to download
    // the exact revision this @playwright/test version expects (`npx playwright
    // install` normally handles this) -- unset in every normal local/CI run.
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH }
      : undefined,
  },

  // Only starts a server when PLAYWRIGHT_BASE_URL isn't already pointing at one (a
  // running local dev server, a Vercel preview, staging) -- CI and local runs both
  // commonly point this at an already-deployed environment instead of building one here.
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        command: `npm run dev -- --port ${PORT}`,
        url: baseURL,
        reuseExistingServer: !isCI,
        timeout: 120_000,
      },

  projects: [
    // Unauthenticated flows -- must run with a clean, signed-out context, so they
    // never load the shared storageState the other projects depend on. Anchored with
    // (^|\/) so this never accidentally matches "un" + "authenticated/..." too (a plain
    // substring match on "authenticated/" does, since "unauthenticated/" contains it).
    {
      name: "unauthenticated",
      testMatch: /(^|\/)unauthenticated\/.*\.spec\.ts/,
      use: { ...devices["Desktop Chrome"] },
    },

    // One real UI login, saved once and reused -- avoids re-authenticating in every
    // test file (slow, and hammers the real Supabase Auth API for no reason).
    {
      name: "setup",
      testMatch: /auth\.setup\.ts/,
      use: { ...devices["Desktop Chrome"] },
    },

    {
      name: "desktop",
      testMatch: /(^|\/)authenticated\/.*\.spec\.ts/,
      dependencies: ["setup"],
      use: {
        ...devices["Desktop Chrome"],
        storageState: "playwright/.auth/user.json",
      },
    },

    // Mobile viewport of the same authenticated specs -- CLAUDE.md's own platform-wide
    // rule (any table-of-rows page collapses to cards below `md`) has caused enough real
    // regressions this session (crashes, cramped layouts) that every authenticated spec
    // running at a real phone viewport, not just a couple of dedicated ones, is the
    // point: it catches "renders fine at 1280px, broken at 390px" without a second,
    // hand-maintained copy of every test.
    {
      name: "mobile",
      testMatch: /(^|\/)authenticated\/.*\.spec\.ts/,
      dependencies: ["setup"],
      use: {
        ...devices["Pixel 7"],
        storageState: "playwright/.auth/user.json",
      },
    },
  ],
});
