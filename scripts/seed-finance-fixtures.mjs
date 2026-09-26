#!/usr/bin/env node
/**
 * FIN-10: loads the deterministic Finance fixture set (`scripts/lib/finance-fixtures.mjs`)
 * into a LOCAL Postgres database that already has the platform's migrations applied — the
 * kind `scripts/lib/rls-test-harness.mjs` creates.
 *
 *   PGUSER=postgres PGPASSWORD=postgres PGHOST=127.0.0.1 \
 *     node scripts/seed-finance-fixtures.mjs --database <local db>
 *   node scripts/seed-finance-fixtures.mjs --print > finance-fixtures.sql
 *
 * Never production: it refuses any host that is not this machine, any database whose name
 * says prod, and anything that looks like a hosted Supabase project. The fixture inserts
 * `auth.users` rows directly, which a real project must never receive. Re-running is safe:
 * every row has a fixed id and is inserted `on conflict do nothing`.
 *
 * After seeding, the documents are history Finance has not posted yet — run the backfill
 * (FIN-2) to post them, which is itself the "historical backfill" scenario.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { financeFixtureSql } from "./lib/finance-fixtures.mjs";

const ROOT = new URL("..", import.meta.url).pathname;
const LOCAL_HOSTS = new Set(["", "localhost", "127.0.0.1", "::1"]);

/** Why this target is refused, or null when it is a local database. Exported for tests. */
export function refusalFor({ host = "", database = "" }) {
  if (!database) return "Pass --database <name> of a local test database.";
  if (/prod/i.test(database)) return `Refusing a database named "${database}".`;
  if (/supabase|pooler|amazonaws|\.co$|\.com$/i.test(host)) return `Refusing hosted database host "${host}".`;
  if (!LOCAL_HOSTS.has(host) && !host.startsWith("/")) return `Refusing non-local host "${host}" — local test databases only.`;
  return null;
}

function main() {
  const args = process.argv.slice(2);
  const sql = financeFixtureSql(ROOT);
  if (args.includes("--print")) {
    process.stdout.write(sql);
    return;
  }
  const database = args[args.indexOf("--database") + 1] && args.includes("--database") ? args[args.indexOf("--database") + 1] : "";
  const refusal = refusalFor({ host: process.env.PGHOST ?? "", database });
  if (refusal) {
    console.error(refusal);
    process.exit(1);
  }

  const dir = mkdtempSync(join(tmpdir(), "finance-fixtures-"));
  try {
    const file = join(dir, "fixtures.sql");
    writeFileSync(file, sql);
    execFileSync("psql", ["-d", database, "-v", "ON_ERROR_STOP=1", "-q", "-f", file], { stdio: "inherit" });
    console.log(`Finance fixtures loaded into ${database}.`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

if (import.meta.url === `file://${process.argv[1]}`) main();
