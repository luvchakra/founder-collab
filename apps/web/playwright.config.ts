import { existsSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";

// The test runner (not just `next dev`) needs the Supabase URL/keys for the two-tenant
// fixtures (e2e/support/tenants.ts) and the API-level security specs. Values already in
// the environment win, so CI can inject them as secrets instead.
if (existsSync(".env.local")) process.loadEnvFile(".env.local");

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
/** E2E_SELF_PROVISION=1: the suite seeds its own e2e-qa tenants (e2e/tenants.setup.ts)
 * and signs in as the seeded owner instead of a hand-made E2E_TEST_EMAIL account. */
const selfProvision = process.env.E2E_SELF_PROVISION === "1";
/** Comma-separated extra engines for the cross-browser smoke ("firefox,webkit"). Only
 * Chromium is installed by default; the others need `npx playwright install`. */
const extraBrowsers = (process.env.E2E_BROWSERS ?? "").split(",").map((b) => b.trim()).filter(Boolean);

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
    trace: "retain-on-failure",
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
    // Two-tenant fixtures (support/tenants.ts): seeded once, removed after every
    // dependent project has finished, pass or fail.
    {
      name: "tenants",
      testMatch: /tenants\.setup\.ts/,
      teardown: "tenants-teardown",
    },
    { name: "tenants-teardown", testMatch: /tenants\.teardown\.ts/ },

    // API/HTTP-level security suite: direct PostgREST calls with real user JWTs, and
    // direct requests to route handlers -- the "bypass the UI" half of every
    // authorization/tenant-isolation/licensing check (e2e/security/).
    {
      name: "security",
      testMatch: /(^|\/)security\/.*\.spec\.ts/,
      dependencies: ["tenants"],
      use: { ...devices["Desktop Chrome"] },
    },

    // Browser half of the multi-user suite: signs in as each seeded role through the
    // real login form (e2e/multi-user/).
    {
      name: "multi-user",
      testMatch: /(^|\/)multi-user\/.*\.spec\.ts/,
      testIgnore: /\.mobile\.spec\.ts/,
      dependencies: ["tenants"],
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "multi-user-mobile",
      testMatch: /(^|\/)multi-user\/.*\.mobile\.spec\.ts/,
      dependencies: ["tenants"],
      use: { ...devices["Pixel 7"] },
    },
    ...extraBrowsers.map((engine) => ({
      name: `smoke-${engine}`,
      testMatch: /(^|\/)unauthenticated\/.*\.spec\.ts/,
      use: { ...(engine === "webkit" ? devices["Desktop Safari"] : devices["Desktop Firefox"]) },
    })),

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
      dependencies: selfProvision ? ["tenants"] : [],
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
