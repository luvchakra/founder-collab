/**
 * Epic 2, story C-8: reusable RLS + license test harness. Extracted from
 * test-discovery-rls.mjs's own database setup/teardown and psql/assertion helpers so
 * later modules (test-inventory-rls.mjs, test-fsm-rls.mjs, ... as SP-3a/F-1/etc. land)
 * don't each reimplement them -- every real Postgres RLS test in this repo applies the
 * same one ordered migration timeline (supabase/migrations/ is platform-wide, not
 * per-module) to a throwaway database, so the setup/teardown is identical regardless of
 * which module's tables a given script is actually asserting against.
 */
import { execFile, execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

function run(cmd, args, opts = {}) {
  return execFileSync(cmd, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], ...opts });
}

function makePsql(testDb) {
  return function psql(sql) {
    return run("psql", ["-d", testDb, "-v", "ON_ERROR_STOP=1", "-t", "-A", "-q", "-c", sql]).trim();
  };
}

/** Async counterpart to psql -- exists for concurrent-caller tests (e.g. D-5's
 * core.next_number()), where the whole point is issuing several calls at once and
 * observing how Postgres serializes them, which a synchronous psql() can't do. */
function makePsqlAsync(testDb) {
  return async function psqlAsync(sql) {
    const { stdout } = await execFileAsync("psql", [
      "-d",
      testDb,
      "-v",
      "ON_ERROR_STOP=1",
      "-t",
      "-A",
      "-q",
      "-c",
      sql,
    ]);
    return stdout.trim();
  };
}

/** Runs `sql` as `userId` would see it -- sets the same session-local role/JWT claim
 * Supabase's PostgREST layer sets for an authenticated request, so RLS policies (and any
 * SECURITY DEFINER helper that reads auth.uid(), like core.has_module()/has_permission())
 * behave exactly as they would for a real request from that user. */
function makePsqlAs(psql) {
  return function psqlAs(userId, sql) {
    return psql(`
      set local role authenticated;
      set local request.jwt.claim.sub = '${userId}';
      ${sql}
    `);
  };
}

function makePsqlAsAsync(psqlAsync) {
  return function psqlAsAsync(userId, sql) {
    return psqlAsync(`
      set local role authenticated;
      set local request.jwt.claim.sub = '${userId}';
      ${sql}
    `);
  };
}

function assertEqual(actual, expected, label) {
  if (String(actual).trim() !== String(expected)) {
    throw new Error(`FAIL: ${label} — expected "${expected}", got "${actual}"`);
  }
  console.log(`  ok: ${label}`);
}

function assertThrows(fn, label) {
  try {
    fn();
  } catch {
    console.log(`  ok: ${label}`);
    return;
  }
  throw new Error(`FAIL: ${label} — expected an error, none was thrown`);
}

/**
 * Sets up a throwaway Postgres database (a local instance by default, or whatever
 * PGHOST/PGPORT/PGUSER/PGPASSWORD/PGDATABASE point at -- CI runs this against a postgres
 * service container), applies the auth/storage stub then every migration in
 * `migrationsDir` in filename order, runs `testFn({ psql, psqlAs, assertEqual,
 * assertThrows })`, and drops the database in a finally block regardless of outcome.
 */
export async function withTestDatabase({ dbNamePrefix, migrationsDir, stubFile, testFn }) {
  const testDb = `${dbNamePrefix}_${process.pid}`;
  const psql = makePsql(testDb);
  const psqlAs = makePsqlAs(psql);
  const psqlAsync = makePsqlAsync(testDb);
  const psqlAsAsync = makePsqlAsAsync(psqlAsync);

  console.log(`Setting up ${testDb}...`);
  try {
    run("dropdb", ["--if-exists", testDb]);
  } catch {
    // fine if it didn't exist
  }
  run("createdb", [testDb]);
  run("psql", ["-d", testDb, "-v", "ON_ERROR_STOP=1", "-f", stubFile]);

  const migrationFiles = readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  for (const file of migrationFiles) {
    console.log(`Applying ${file}...`);
    run("psql", ["-d", testDb, "-v", "ON_ERROR_STOP=1", "-f", join(migrationsDir, file)]);
  }

  try {
    await testFn({ psql, psqlAs, psqlAsync, psqlAsAsync, assertEqual, assertThrows });
  } finally {
    try {
      run("dropdb", ["--if-exists", testDb]);
    } catch {
      // best-effort cleanup
    }
  }
}
