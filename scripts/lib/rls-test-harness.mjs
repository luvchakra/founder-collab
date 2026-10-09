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
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
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

function sqlLiteral(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function databaseExists(name) {
  return run("psql", ["-d", "postgres", "-tAc", `select 1 from pg_database where datname = ${sqlLiteral(name)}`]).trim() === "1";
}

/**
 * Applies the stub and the whole migration timeline ONCE into a template database and
 * returns its name; every test database is then a `createdb -T` copy of it, which takes
 * well under a second instead of re-running 260+ migrations per script (that re-run was
 * ~20 of CI's 25 minutes). The name is a hash of the stub and every migration's name and
 * contents, so any change to either builds a fresh template -- a stale schema can never be
 * tested. Safe to call from many test processes at once: each builds under its own
 * temporary name and the first rename wins; the losers drop their copy and use the winner.
 */
export function ensureTemplateDatabase({ migrationsDir, stubFile }) {
  const migrationFiles = readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  const hash = createHash("sha256");
  hash.update(readFileSync(stubFile));
  for (const file of migrationFiles) {
    hash.update(file);
    hash.update(readFileSync(join(migrationsDir, file)));
  }
  const templateDb = `rls_tmpl_${hash.digest("hex").slice(0, 16)}`;
  if (databaseExists(templateDb)) return templateDb;

  const buildDb = `${templateDb}_build_${process.pid}`;
  console.log(`Building template ${templateDb} (${migrationFiles.length} migrations)...`);
  try {
    run("dropdb", ["--if-exists", buildDb]);
  } catch {
    // fine if it didn't exist
  }
  run("createdb", [buildDb]);
  try {
    // One psql process for the whole timeline; ON_ERROR_STOP names the failing file:line.
    const fileArgs = [stubFile, ...migrationFiles.map((f) => join(migrationsDir, f))].flatMap((f) => ["-f", f]);
    run("psql", ["-d", buildDb, "-q", "-v", "ON_ERROR_STOP=1", ...fileArgs], { maxBuffer: 64 * 1024 * 1024 });
    try {
      run("psql", ["-d", "postgres", "-c", `alter database "${buildDb}" rename to "${templateDb}"`]);
    } catch (error) {
      // Another process finished first -- use its template.
      if (!databaseExists(templateDb)) throw error;
      run("dropdb", ["--if-exists", buildDb]);
    }
  } catch (error) {
    try {
      run("dropdb", ["--if-exists", buildDb]);
    } catch {
      // best-effort cleanup
    }
    throw error;
  }

  // Templates from older migration timelines are dead weight; drop them best-effort (one
  // still being copied from by a concurrent run simply refuses, which is fine).
  const stale = run("psql", [
    "-d",
    "postgres",
    "-tAc",
    `select datname from pg_database where datname like 'rls\\_tmpl\\_%' and datname <> ${sqlLiteral(templateDb)} and datname not like '%\\_build\\_%'`,
  ])
    .split("\n")
    .map((name) => name.trim())
    .filter(Boolean);
  for (const name of stale) {
    try {
      run("dropdb", ["--if-exists", name]);
    } catch {
      // in use elsewhere
    }
  }
  return templateDb;
}

/**
 * Sets up a throwaway Postgres database (a local instance by default, or whatever
 * PGHOST/PGPORT/PGUSER/PGPASSWORD/PGDATABASE point at -- CI runs this against a postgres
 * service container) as a copy of the migrated template (ensureTemplateDatabase above:
 * the auth/storage stub then every migration in `migrationsDir` in filename order), runs
 * `testFn({ psql, psqlAs, assertEqual, assertThrows })`, and drops the database in a
 * finally block regardless of outcome.
 */
export async function withTestDatabase({ dbNamePrefix, migrationsDir, stubFile, testFn }) {
  const testDb = `${dbNamePrefix}_${process.pid}`;
  const psql = makePsql(testDb);
  const psqlAs = makePsqlAs(psql);
  const psqlAsync = makePsqlAsync(testDb);
  const psqlAsAsync = makePsqlAsAsync(psqlAsync);

  const templateDb = ensureTemplateDatabase({ migrationsDir, stubFile });
  console.log(`Setting up ${testDb} from ${templateDb}...`);
  try {
    run("dropdb", ["--if-exists", testDb]);
  } catch {
    // fine if it didn't exist
  }
  run("createdb", ["-T", templateDb, testDb]);

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
