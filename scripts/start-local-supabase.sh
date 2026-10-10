#!/usr/bin/env bash
# Starts a throwaway local Supabase stack (Docker) with the platform's whole migration
# timeline, and points apps/web at it -- the backend the e2e suite runs against in CI,
# the way wonder-creator runs its own: real Auth, PostgREST and Storage, never the hosted
# project, no secrets. Also usable by hand: `bash scripts/start-local-supabase.sh`, then
# `npx supabase stop --no-backup` when done.
#
# Two deliberate departures from a plain `supabase start`:
#  - Migrations are applied by psql in filename order, the order the hosted project, the
#    DB test harness and lint-migration-schema all use. The CLI applies supabase/migrations
#    itself but needs unique version prefixes, and this timeline has ~35 shared ones
#    (e.g. two 20260911004100_* files); renaming them would rewrite the history.
#  - PostgREST starts on the built-in schemas only (supabase/config.toml), because the
#    platform's own don't exist yet; the migrations set the full list on the authenticator
#    role (pgrst.db_schemas, as on the hosted project) and a config reload picks it up.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
SUPABASE="npx -y supabase@2.118.0"
# Only what the app talks to: Postgres, Auth (with its local mail catcher), PostgREST,
# Storage and the gateway in front.
EXCLUDE="realtime,studio,imgproxy,edge-runtime,logflare,vector,supavisor,postgres-meta"

# Start with an empty migrations directory, restoring the real one however this exits.
mv supabase/migrations supabase/migrations.repo
mkdir supabase/migrations
restore() { rmdir supabase/migrations 2>/dev/null || true; mv supabase/migrations.repo supabase/migrations; }
trap restore EXIT
$SUPABASE start -x "$EXCLUDE"
restore
trap - EXIT

status="$($SUPABASE status -o json)"
db_url="$(node -e 'console.log(JSON.parse(process.argv[1]).DB_URL)' "$status")"

files=()
for f in $(ls supabase/migrations/*.sql | sort); do files+=(-f "$f"); done
echo "Applying ${#files[@]} migration file arguments in filename order..."
psql "$db_url" -q -v ON_ERROR_STOP=1 "${files[@]}" >/dev/null
psql "$db_url" -q -c "notify pgrst, 'reload config'; notify pgrst, 'reload schema';"

# Local-only values: the stack's own demo keys and placeholder secrets, never real ones.
# Never clobber a developer's own env file outside CI.
if [ -e apps/web/.env.local ] && [ -z "${CI:-}" ]; then
  echo "apps/web/.env.local exists; not overwriting it. Move it aside to point the app at this stack." >&2
  exit 1
fi
node -e '
  const d = JSON.parse(process.argv[1]);
  require("fs").writeFileSync(process.argv[2], [
    `NEXT_PUBLIC_SUPABASE_URL=${d.API_URL}`,
    `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=${d.PUBLISHABLE_KEY}`,
    `SUPABASE_SERVICE_ROLE_KEY=${d.SECRET_KEY}`,
    "CRON_SECRET=local-e2e-cron-secret-000000000000",
    "API_KEY_ENCRYPTION_SECRET=local-e2e-only-not-a-secret-0123456789abcdef",
    "",
  ].join("\n"));
' "$status" apps/web/.env.local
echo "Local Supabase ready at $(node -e 'console.log(JSON.parse(process.argv[1]).API_URL)' "$status"); wrote apps/web/.env.local"
