import { defineConfig } from "vitest/config";

/**
 * Without this, vitest's default `include` also matched `e2e/**\/*.spec.ts` -- Playwright
 * specs, which import `@playwright/test` and fail at collection under vitest. `npm run
 * test` therefore reported ten failed files on every single run, in every environment,
 * for reasons that had nothing to do with the code: a permanently red suite that a real
 * failure could hide in indefinitely (an outage that took every `(auth)` page down with a
 * 500 did exactly that).
 *
 * The e2e specs are run by `npm run e2e` (playwright.config.ts), which is the only runner
 * that can actually drive them.
 */
export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
  },
});
