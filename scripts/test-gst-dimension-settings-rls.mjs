#!/usr/bin/env node
/**
 * Tenant-isolation + license-gating + permission-gating test for `gst.dimension_settings`
 * (FIN-9), plus its own invariants: one row per business per dimension, only the four
 * known dimensions, no delete policy (switching off is `enabled = false`) -- and "never
 * mandatory": enabling every dimension leaves an untagged journal line perfectly valid.
 */
import { join } from "node:path";
import { withTestDatabase } from "./lib/rls-test-harness.mjs";

const ROOT = new URL("..", import.meta.url).pathname;
const MIGRATIONS_DIR = join(ROOT, "supabase", "migrations");
const STUB_FILE = join(ROOT, "supabase", "tests", "local-stub.sql");

const ALICE = "11111111-1111-1111-1111-111111111111";
const BOB = "22222222-2222-2222-2222-222222222222";
const CAROL = "33333333-3333-3333-3333-333333333333"; // viewer in Alice's business

async function main() {
  await withTestDatabase({
    dbNamePrefix: "gst_dimension_settings_rls_test",
    migrationsDir: MIGRATIONS_DIR,
    stubFile: STUB_FILE,
    testFn: async ({ psql, psqlAs, assertEqual, assertThrows }) => {
      const asAlice = (sql) => psqlAs(ALICE, sql);
      const asBob = (sql) => psqlAs(BOB, sql);
      const asCarol = (sql) => psqlAs(CAROL, sql);

      console.log("Seeding two businesses, a viewer, Finance licences...");
      psql(`
        insert into auth.users (id, email) values
          ('${ALICE}', 'alice@example.com'), ('${BOB}', 'bob@example.com'), ('${CAROL}', 'carol@example.com');
        grant usage on schema core to authenticated;
        grant select, insert, update, delete on all tables in schema core to authenticated;
        grant usage on schema gst to authenticated;
      `);
      const alice = psql(`insert into core.businesses (account_id, name)
        select account_id, 'Alice Co' from core.account_members where user_id = '${ALICE}' returning id;`);
      const bob = psql(`insert into core.businesses (account_id, name)
        select account_id, 'Bob Co' from core.account_members where user_id = '${BOB}' returning id;`);
      psql(`
        insert into core.business_members (business_id, user_id, role) values
          ('${alice}', '${ALICE}', 'owner'), ('${alice}', '${CAROL}', 'viewer'), ('${bob}', '${BOB}', 'owner')
        on conflict do nothing;
        insert into core.licenses (account_id, business_id, module_key, status)
        select account_id, id, 'gst', 'active' from core.businesses where id in ('${alice}', '${bob}');
      `);

      const enable = (business, key, label = null) =>
        `insert into gst.dimension_settings (business_id, dimension_key, enabled, label)
         values ('${business}', '${key}', true, ${label ? `'${label}'` : "null"}) returning dimension_key`;

      console.log("Permission gating: a viewer cannot configure dimensions; the owner can...");
      assertThrows(() => asCarol(enable(alice, "location")), "viewer lacks gst.dimensions.manage");
      assertEqual(asAlice(enable(alice, "location", "Branch")), "location", "owner switched location on as 'Branch'");
      for (const key of ["party", "item", "project"]) asAlice(enable(alice, key));
      assertEqual(asCarol(`select count(*) from gst.dimension_settings`), "4", "a viewer can read the settings");

      console.log("Invariants: one row per dimension, only the four known ones, no delete...");
      assertThrows(() => asAlice(enable(alice, "location")), "a second location row collides");
      assertThrows(() => asAlice(enable(alice, "colour")), "unknown dimension refused");
      assertThrows(() => asAlice(`update gst.dimension_settings set label = '' where business_id = '${alice}' and dimension_key = 'project'`), "blank label refused (null means default)");
      assertThrows(() => asAlice(`delete from gst.dimension_settings where business_id = '${alice}'`), "no delete (no grant, no policy)");
      asAlice(`update gst.dimension_settings set enabled = false where business_id = '${alice}' and dimension_key = 'item'`);
      assertEqual(asAlice(`select enabled::text from gst.dimension_settings where business_id = '${alice}' and dimension_key = 'item'`), "false", "switching off is an update");

      console.log("Never mandatory: with every dimension on, an untagged line still posts...");
      const bank = psql(`insert into gst.accounts (business_id, account_number, name, type) values ('${alice}', '1100', 'Bank', 'asset') returning id;`);
      const capital = psql(`insert into gst.accounts (business_id, account_number, name, type) values ('${alice}', '3100', 'Capital', 'equity') returning id;`);
      asAlice(`
        with e as (insert into gst.journal_entries (business_id, posting_date, status) values ('${alice}', '2026-09-01', 'posted') returning id)
        insert into gst.journal_lines (business_id, entry_id, line_number, account_id, debit, credit)
        select '${alice}', e.id, v.n, v.a::uuid, v.d, v.c from e, (values (1, '${bank}', 100, 0), (2, '${capital}', 0, 100)) v(n, a, d, c)`);
      assertEqual(asAlice(`select count(*) from gst.journal_lines where business_id = '${alice}' and location is null and project_ref is null and party_id is null`), "2", "untagged lines posted");

      console.log("Tenant isolation: Bob neither sees nor changes Alice's settings...");
      assertEqual(asBob(`select count(*) from gst.dimension_settings`), "0", "Bob reads nothing of Alice's");
      assertEqual(asBob(`update gst.dimension_settings set enabled = false where business_id = '${alice}' returning dimension_key`), "", "Bob's update touches nothing");
      assertThrows(() => asBob(enable(alice, "party")), "Bob cannot insert into Alice's business");
      assertEqual(asBob(enable(bob, "project", "Job")), "project", "Bob configures his own business independently");

      console.log("Licence gating: grace is read-only, expired is unreadable, rows retained...");
      psql(`update core.licenses set status = 'grace', grace_ends_at = now() + interval '30 days' where business_id = '${alice}' and module_key = 'gst';`);
      assertEqual(asAlice(`select count(*) from gst.dimension_settings`), "4", "readable during grace");
      assertEqual(asAlice(`update gst.dimension_settings set enabled = true where business_id = '${alice}' returning dimension_key`), "", "no edits during grace");
      psql(`update core.licenses set status = 'expired' where business_id = '${alice}' and module_key = 'gst';`);
      assertEqual(asAlice(`select count(*) from gst.dimension_settings`), "0", "unreadable once expired");
      assertEqual(psql(`select count(*) from gst.dimension_settings where business_id = '${alice}'`), "4", "retained (ADR-9)");

      console.log("All gst.dimension_settings assertions passed.");
    },
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
