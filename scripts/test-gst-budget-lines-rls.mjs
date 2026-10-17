#!/usr/bin/env node
/**
 * FIN-BUDGET-ENTRY — tenant isolation, licence gating and permission gating for
 * `gst.budget_lines`, the table the Set budget screen writes. Runs as `authenticated`
 * with only the grants the migrations issue (no extra grant on the gst schema's tables),
 * so a missing table grant fails here as 42501 rather than in production.
 */
import { join } from "node:path";
import { withTestDatabase } from "./lib/rls-test-harness.mjs";

const ROOT = new URL("..", import.meta.url).pathname;
const MIGRATIONS_DIR = join(ROOT, "supabase", "migrations");
const STUB_FILE = join(ROOT, "supabase", "tests", "local-stub.sql");

const ALICE = "11111111-1111-1111-1111-111111111111"; // owner, Alice Co
const BOB = "22222222-2222-2222-2222-222222222222"; // owner, Bob Co
const CAROL = "33333333-3333-3333-3333-333333333333"; // viewer in Alice Co
const DAVE = "44444444-4444-4444-4444-444444444444"; // accountant in Alice Co

async function main() {
  await withTestDatabase({
    dbNamePrefix: "gst_budget_lines_rls_test",
    migrationsDir: MIGRATIONS_DIR,
    stubFile: STUB_FILE,
    testFn: async ({ psql, psqlAs, assertEqual, assertThrows }) => {
      const asAlice = (sql) => psqlAs(ALICE, sql);
      const asBob = (sql) => psqlAs(BOB, sql);
      const asCarol = (sql) => psqlAs(CAROL, sql);
      const asDave = (sql) => psqlAs(DAVE, sql);

      console.log("Seeding two businesses, a viewer and an accountant, Finance licences...");
      psql(`
        insert into auth.users (id, email) values
          ('${ALICE}', 'alice@example.com'), ('${BOB}', 'bob@example.com'),
          ('${CAROL}', 'carol@example.com'), ('${DAVE}', 'dave@example.com');
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
          ('${alice}', '${ALICE}', 'owner'), ('${alice}', '${CAROL}', 'viewer'),
          ('${alice}', '${DAVE}', 'accountant'), ('${bob}', '${BOB}', 'owner')
        on conflict do nothing;
        insert into core.licenses (account_id, business_id, module_key, status)
        select account_id, id, 'gst', 'active' from core.businesses where id in ('${alice}', '${bob}');
      `);
      const account = (business, number, name, type) =>
        psql(`insert into gst.accounts (business_id, account_number, name, type) values ('${business}', '${number}', '${name}', '${type}') returning id;`);
      const aliceRent = account(alice, "6100", "Rent", "expense");
      const bobRent = account(bob, "6100", "Rent", "expense");

      // The Set budget screen's write: upsert on (business, account, month).
      const upsert = (business, accountId, month, amount) => `
        insert into gst.budget_lines (business_id, account_id, period_start, amount)
        values ('${business}', '${accountId}', '${month}', ${amount})
        on conflict (business_id, account_id, period_start) do update set amount = excluded.amount
        returning amount`;

      console.log("Permission gating: the owner and an accountant can set figures; a viewer cannot...");
      assertEqual(asAlice(upsert(alice, aliceRent, "2026-04-01", 1000)), "1000.00", "owner set April");
      assertEqual(asDave(upsert(alice, aliceRent, "2026-04-01", 1200)), "1200.00", "accountant changed April (upsert)");
      assertEqual(psql(`select count(*) from gst.budget_lines where business_id = '${alice}'`), "1", "an upsert, not a second row");
      assertThrows(() => asCarol(upsert(alice, aliceRent, "2026-05-01", 1)), "viewer lacks gst.accounts.write");
      assertEqual(asCarol(`update gst.budget_lines set amount = 1 returning id`), "", "viewer's update touches nothing");
      assertEqual(asCarol(`select count(*) from gst.budget_lines`), "1", "a viewer can read the budget");

      console.log("Tenant isolation: Bob sees and changes none of Alice's figures...");
      asBob(upsert(bob, bobRent, "2026-04-01", 50));
      assertEqual(asBob(`select count(*) from gst.budget_lines`), "1", "Bob sees only his own line");
      assertEqual(asAlice(`select count(*) from gst.budget_lines`), "1", "Alice sees only her own line");
      assertEqual(asBob(`update gst.budget_lines set amount = 0 where business_id = '${alice}' returning id`), "", "Bob's update touches nothing");
      assertEqual(asBob(`delete from gst.budget_lines where business_id = '${alice}' returning id`), "", "Bob's delete touches nothing");
      assertThrows(() => asBob(upsert(alice, aliceRent, "2026-06-01", 1)), "Bob cannot write into Alice's business");
      assertThrows(() => asAlice(upsert(alice, bobRent, "2026-06-01", 1)), "Alice cannot budget against Bob's account");

      console.log("Clearing a month removes its line...");
      asAlice(upsert(alice, aliceRent, "2026-05-01", 300));
      assertEqual(asAlice(`delete from gst.budget_lines where account_id = '${aliceRent}' and period_start = '2026-05-01' returning amount`), "300.00", "owner cleared May");

      console.log("Licence gating: read-only in grace, unreadable once expired, retained (ADR-9)...");
      psql(`update core.licenses set status = 'grace', grace_ends_at = now() + interval '30 days' where business_id = '${alice}' and module_key = 'gst';`);
      assertEqual(asAlice(`select count(*) from gst.budget_lines`), "1", "readable during grace");
      assertThrows(() => asAlice(upsert(alice, aliceRent, "2026-07-01", 1)), "no new figures during grace");
      assertEqual(asAlice(`update gst.budget_lines set amount = 1 returning id`), "", "no edits during grace");
      assertEqual(asAlice(`delete from gst.budget_lines returning id`), "", "no deletes during grace");
      psql(`update core.licenses set status = 'expired' where business_id = '${alice}' and module_key = 'gst';`);
      assertEqual(asAlice(`select count(*) from gst.budget_lines`), "0", "unreadable once expired");
      assertEqual(psql(`select count(*) from gst.budget_lines where business_id = '${alice}'`), "1", "but retained");

      console.log("All gst.budget_lines assertions passed.");
    },
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
