# Using fewer Vercel build slots

A Vercel team has a fixed number of concurrent builds, shared by **every project on the
team**. With one slot, a build of app A queues behind a nightly test build of app B, and a
production fix can wait most of an hour. Each rule below cuts the number of builds, or how
long each one holds the slot. They apply to any app on the team.

## 1. Build only what can change the deployed app

- **Turn preview deployments off**, unless someone actually opens previews to review.
  Verify in CI instead (rule 2).
- **Add an Ignored Build Step** (`ignoreCommand` in `vercel.json`, a script that exits 0 to
  skip). Production should build only when the app's inputs changed since the last
  production deployment, for example:
  `git diff --quiet "$VERCEL_GIT_PREVIOUS_SHA" HEAD -- <app dir> <shared packages> package.json <lockfile>`.
  Docs, migrations, CI config and test-only changes then skip.
- Still build when `VERCEL_GIT_PREVIOUS_SHA` is empty, or equals `VERCEL_GIT_COMMIT_SHA`. The
  second case is a deliberate Redeploy, usually to pick up a changed environment variable.
- **Skip bot branches** (Dependabot, Renovate, `e2e/*`, `wip/*`) in the same script, by
  checking `VERCEL_GIT_COMMIT_REF`.
- **One Vercel project per repo.** A second project linked to the same repository builds
  every push again. Disconnect stray or duplicate projects.

## 2. Verify in CI, not on Vercel

- Run lint, typecheck, unit tests, `next build` and end-to-end tests in GitHub Actions.
  For e2e, use `next build && next start` against a test database. Never push a commit
  just to see whether Vercel builds it.
- **Don't create a Vercel deployment to run e2e** (an `e2e/nightly` branch, a "deploy then
  test" job). If you need a deployed target, test the production URL that already exists.
- **Stagger scheduled jobs across apps.** Two apps' nightly builds at the same minute queue
  behind each other every night.

## 3. Fewer, larger production deploys

- **Push when a branch is ready, not after every commit.** Squash-merge, so each merge
  is one production build.
- **Batch small app-code changes.** Several small stories from one request can share one
  PR and one build. Docs-only, migration-only and test-only PRs cost nothing once rule 1 is
  in place.
- **Redeploy only for environment-variable changes.** Never redeploy to retry a build that
  failed for a real reason: fix it, then push.

## 4. Hold the slot for less time

- Leave the build cache on (`.next/cache`). Don't add `--force` or clear the cache by
  default.
- Don't repeat CI's work in the Vercel build: no lint or test steps inside `build`.
- Keep `vercel.json` `regions` and `installCommand` defaults simple. Use `npm ci` from the
  lockfile, not a fresh resolve.
- In the team settings, turn on **Prioritize Production Builds**, so a production deploy
  jumps ahead of queued previews.

## 5. Check before blaming the code

When a deploy sits in `QUEUED`, list the team's builds in `BUILDING` state. Usually another
project holds the slot, and the fix is one of the rules above in *that* project.
