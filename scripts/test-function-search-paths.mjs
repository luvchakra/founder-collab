#!/usr/bin/env node
/**
 * Every function in the platform's own schemas pins its search_path (Supabase advisor lint
 * function_search_path_mutable). Without a pinned search_path, an unqualified name inside a
 * function resolves through whatever search_path its caller set -- a SECURITY DEFINER
 * function can be steered into another schema's object. Three plain-SQL helpers slipped
 * through until 20261010090000_pin_function_search_paths.sql; this keeps new ones from
 * doing the same. Extension-owned functions are someone else's and are left out.
 */
import { join } from "node:path";
import { withTestDatabase } from "./lib/rls-test-harness.mjs";

const ROOT = new URL("..", import.meta.url).pathname;
const SCHEMAS = ["core", "discovery", "inventory", "gst", "fsm", "crm", "platform"];

async function main() {
  await withTestDatabase({
    dbNamePrefix: "function_search_paths_test",
    migrationsDir: join(ROOT, "supabase", "migrations"),
    stubFile: join(ROOT, "supabase", "tests", "local-stub.sql"),
    testFn: async ({ psql, assertEqual }) => {
      const unpinned = psql(`
        select string_agg(n.nspname || '.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')', ', ' order by 1)
        from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = any (array[${SCHEMAS.map((s) => `'${s}'`).join(", ")}])
          and p.prokind in ('f', 'p')
          and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
          and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%');
      `);
      assertEqual(unpinned, "", "every platform function pins its search_path");
    },
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
