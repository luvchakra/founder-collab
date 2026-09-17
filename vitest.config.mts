import { defineConfig } from "vitest/config";

/**
 * Root config for cross-workspace runs — coverage, and a single `vitest` invocation over
 * every package. `npm run test` still runs each workspace's own `vitest run` (that is what
 * CI gates on, and what stays fastest when working inside one package); this exists so
 * coverage can be measured across the monorepo as one number instead of four unrelated
 * ones.
 *
 * Component tests opt into jsdom with a `// @vitest-environment jsdom` docblock rather
 * than a global environment setting, so the default stays node — the vast majority of
 * this repo's tests are server-side and would only pay for a DOM they never touch.
 */
export default defineConfig({
  test: {
    projects: ["apps/web", "packages/core", "packages/module-discovery", "packages/module-registry"],
    coverage: {
      provider: "v8",
      reporter: ["text-summary", "html", "lcov"],
      reportsDirectory: "coverage",
      include: ["apps/web/**/*.{ts,tsx}", "packages/*/src/**/*.{ts,tsx}"],
      exclude: [
        "**/*.test.{ts,tsx}",
        "**/*.d.ts",
        // Next build output, not authored code (apps/web/.next/types/* is generated).
        "**/.next/**",
        // Vendored shadcn primitives: structural UI taken wholesale from an upstream
        // source (CLAUDE.md non-negotiable #7), not code this repo authors or changes.
        "packages/core/src/components/ui/**",
        // Test infrastructure — exercised by every suite that uses it, not a subject.
        "packages/core/src/test-support/**",
        // Type-only modules compile away to nothing executable.
        "**/types.ts",
      ],
      /**
       * Two kinds of threshold, doing two different jobs.
       *
       * The global numbers are a *ratchet*, not a target: they sit just under today's
       * measured coverage so the number can only go up. They are low in absolute terms
       * because the denominator includes every React component and Next page file in the
       * repo, most of which are presentational. Raise these as that changes; never lower
       * them to make a build pass.
       *
       * The per-path numbers are the ones that matter. Each covers a directory carrying
       * one of CLAUDE.md's non-negotiables — licensing enforcement, the event bus,
       * tenancy-sensitive writes, unauthenticated entry points — and is set near what
       * those directories actually achieve today. A change that drops one of these has
       * eroded an invariant, which is exactly the thing CI should refuse.
       */
      thresholds: {
        statements: 50,
        branches: 43,
        functions: 45,
        lines: 49,

        "packages/core/src/licensing/**": { statements: 95, branches: 85, functions: 95, lines: 95 },
        "packages/core/src/events/**": { statements: 85, branches: 80, functions: 85, lines: 88 },
        "packages/core/src/rbac/**": { statements: 90, branches: 80, functions: 90, lines: 90 },
        "packages/core/src/parties/**": { statements: 95, branches: 90, functions: 95, lines: 95 },
        "packages/core/src/attachments/**": { statements: 90, branches: 85, functions: 95, lines: 95 },
        "packages/core/src/email/**": { statements: 95, branches: 80, functions: 95, lines: 95 },
        "packages/core/src/db/middleware.ts": { statements: 80, branches: 90, functions: 40, lines: 80 },
        "packages/module-discovery/src/lib/ai/router.ts": { statements: 95, branches: 90, functions: 90, lines: 95 },
        "packages/module-discovery/src/lib/tenancy/**": { statements: 90, branches: 80, functions: 90, lines: 90 },
        "packages/module-discovery/src/lib/usage/**": { statements: 90, branches: 85, functions: 90, lines: 90 },
        "apps/web/app/api/**": { statements: 90, branches: 85, functions: 90, lines: 90 },
        "apps/web/app/(auth)/actions.ts": { statements: 90, branches: 85, functions: 85, lines: 90 },
        "apps/web/app/auth/**": { statements: 90, branches: 85, functions: 90, lines: 90 },
        "packages/module-discovery/src/lib/alerts/**": { statements: 95, branches: 90, functions: 95, lines: 95 },
      },
    },
  },
});
