#!/usr/bin/env bash
# Runs chosen E2E spec files on your machine the way the nightly run does
# (.github/workflows/e2e-nightly.yml): a fresh local Supabase stack with every migration, a
# production build of the app on :3100, and Playwright against both -- never the hosted
# project (playwright.config.ts refuses it).
#
#   npm run e2e:local -- e2e/security/storage.spec.ts e2e/multi-user/http-routes.spec.ts
#   npm run e2e:local                      # the whole suite
#
# Needs Docker running and `npx playwright install chromium` once. Your apps/web/.env.local
# is moved aside to apps/web/.env.before-e2e.local for the run and put back afterwards,
# however the run ends. E2E_KEEP_STACK=1 leaves the local stack running afterwards.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
ENV_FILE=apps/web/.env.local
SAVED=apps/web/.env.before-e2e.local
SUPABASE="npx -y supabase@2.118.0"

for spec in "$@"; do
  [ -f "apps/web/$spec" ] || { echo "No such spec: apps/web/$spec (paths are relative to apps/web)" >&2; exit 1; }
done
if [ -e "$SAVED" ]; then
  echo "$SAVED exists from an earlier run that didn't finish. Move it back to $ENV_FILE first." >&2
  exit 1
fi
docker info >/dev/null 2>&1 || { echo "Docker isn't running: the local Supabase stack needs it." >&2; exit 1; }

server_pid=""
finish() {
  [ -n "$server_pid" ] && kill "$server_pid" 2>/dev/null || true
  rm -f "$ENV_FILE"
  [ -e "$SAVED" ] && mv "$SAVED" "$ENV_FILE"
  if [ "${E2E_KEEP_STACK:-}" != "1" ]; then $SUPABASE stop --no-backup >/dev/null 2>&1 || true; fi
}
[ -e "$ENV_FILE" ] && mv "$ENV_FILE" "$SAVED"
trap finish EXIT

# A fresh stack every time, as in the nightly run: nothing left from an earlier run.
$SUPABASE stop --no-backup >/dev/null 2>&1 || true
bash scripts/start-local-supabase.sh

npm run build

(cd apps/web && exec npx next start -p 3100 > next.log 2>&1) &
server_pid=$!
for i in $(seq 1 60); do curl -sf -o /dev/null http://localhost:3100/login && break; sleep 1; done
curl -sf -o /dev/null http://localhost:3100/login || { echo "The app did not start:"; tail -50 apps/web/next.log; exit 1; }

cd apps/web
E2E_ALLOW_FIXTURES=1 E2E_SELF_PROVISION=1 E2E_TEST_BUSINESS_SLUG=acme-home-security-qa PLAYWRIGHT_BASE_URL=http://localhost:3100 \
  npx playwright test "$@"
