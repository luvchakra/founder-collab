#!/usr/bin/env node
/**
 * Tenant-isolation + license-gating + uniqueness test for `gst.filing_reminders_sent`
 * (COMPLY-P0-09.3). Same shape as `gst.tax_determinations`: INSERT requires only module
 * licensing (recording a sent reminder is an automatic system byproduct, not a settings
 * action), and there is no UPDATE/DELETE policy at all -- an append-only history of which
 * reminders actually went out.
 */
import { join } from "node:path";
import { withTestDatabase } from "./lib/rls-test-harness.mjs";

const ROOT = new URL("..", import.meta.url).pathname;
const MIGRATIONS_DIR = join(ROOT, "supabase", "migrations");
const STUB_FILE = join(ROOT, "supabase", "tests", "local-stub.sql");

const ALICE = "11111111-1111-1111-1111-111111111111"; // owner
const CAROL = "33333333-3333-3333-3333-333333333333"; // viewer, no settings.manage
const BOB = "22222222-2222-2222-2222-222222222222"; // separate business

async function main() {
  await withTestDatabase({
    dbNamePrefix: "gst_filing_reminders_sent_rls_test",
    migrationsDir: MIGRATIONS_DIR,
    stubFile: STUB_FILE,
    testFn: async ({ psql, psqlAs, assertEqual, assertThrows }) => {
      const psqlAsAlice = (sql) => psqlAs(ALICE, sql);
      const psqlAsCarol = (sql) => psqlAs(CAROL, sql);
      const psqlAsBob = (sql) => psqlAs(BOB, sql);

      psql(`
        insert into auth.users (id, email) values
          ('${ALICE}', 'alice@example.com'),
          ('${CAROL}', 'carol@example.com'),
          ('${BOB}', 'bob@example.com');
        grant usage on schema core to authenticated;
        grant select, insert, update, delete on all tables in schema core to authenticated;
        grant usage on schema gst to authenticated;
        grant select, insert on gst.filing_reminders_sent to authenticated;
      `);
      const aliceBusiness = psql(`
        insert into core.businesses (account_id, name)
        select account_id, 'Alice Co' from core.account_members where user_id = '${ALICE}'
        returning id;
      `);
      const bobBusiness = psql(`
        insert into core.businesses (account_id, name)
        select account_id, 'Bob Co' from core.account_members where user_id = '${BOB}'
        returning id;
      `);
      psql(`
        insert into core.account_members (account_id, user_id, role)
        select account_id, '${CAROL}', 'member' from core.businesses where id = '${aliceBusiness}';
        insert into core.business_members (business_id, user_id, role) values
          ('${aliceBusiness}', '${ALICE}', 'owner'),
          ('${aliceBusiness}', '${CAROL}', 'viewer'),
          ('${bobBusiness}', '${BOB}', 'owner');
      `);

      const insertReminder = (business, returnType, periodEnd, leadDays) => `
        insert into gst.filing_reminders_sent (business_id, return_type, period_end, lead_days)
        values ('${business}', '${returnType}', '${periodEnd}', ${leadDays})
        returning id
      `;

      console.log("Without a gst license, Alice cannot record a reminder yet...");
      assertThrows(
        () => psqlAsAlice(insertReminder(aliceBusiness, "gstr3b", "2026-09-30", 7)),
        "Alice's business has no gst license yet",
      );

      psql(`
        insert into core.licenses (account_id, business_id, module_key, status)
        select account_id, id, 'gst', 'active' from core.businesses where id = '${aliceBusiness}';
      `);

      console.log("Carol (viewer, no settings.manage) CAN record a reminder sent -- this table's INSERT is licensed-membership only, not a settings action...");
      const reminder1 = psqlAsCarol(insertReminder(aliceBusiness, "gstr3b", "2026-09-30", 7));

      console.log("Alice (owner) can record a DIFFERENT lead-day threshold for the same obligation...");
      psqlAsAlice(insertReminder(aliceBusiness, "gstr3b", "2026-09-30", 1));

      console.log("An unrecognized return_type is rejected by the check constraint...");
      assertThrows(
        () => psqlAsAlice(insertReminder(aliceBusiness, "gstr7", "2026-09-30", 7)),
        "return_type check constraint",
      );

      console.log("A negative lead_days is rejected by the check constraint...");
      assertThrows(
        () => psqlAsAlice(insertReminder(aliceBusiness, "gstr3b", "2026-09-30", -1)),
        "lead_days >= 0 check constraint",
      );

      console.log("A duplicate (business, return_type, period_end, lead_days) is rejected by the unique key (idempotency)...");
      assertThrows(
        () => psqlAsAlice(insertReminder(aliceBusiness, "gstr3b", "2026-09-30", 7)),
        "unique(business_id, return_type, period_end, lead_days)",
      );

      console.log("Both distinct reminders for the same obligation are retained...");
      assertEqual(
        psqlAsAlice(`select count(*)::int from gst.filing_reminders_sent where business_id = '${aliceBusiness}' and return_type = 'gstr3b' and period_end = '2026-09-30'`),
        "2",
        "both the 7-day and 1-day reminders are on record",
      );

      console.log("Nobody, not even the owner, can update a sent-reminder row (no UPDATE policy)...");
      assertThrows(() => psqlAsAlice(`update gst.filing_reminders_sent set lead_days = 0 where id = '${reminder1}'`), "no UPDATE policy exists");

      console.log("Nobody can delete one either (no DELETE policy -- append-only history)...");
      assertThrows(() => psqlAsAlice(`delete from gst.filing_reminders_sent where id = '${reminder1}'`), "no DELETE policy exists");

      console.log("Tenant isolation: Bob cannot see or record reminders for Alice's business...");
      assertEqual(
        psqlAsBob(`select count(*)::int from gst.filing_reminders_sent where business_id = '${aliceBusiness}'`),
        "0",
        "Bob's RLS-scoped read of Alice's business returns nothing",
      );
      assertThrows(
        () => psqlAsBob(insertReminder(aliceBusiness, "gstr3b", "2026-09-30", 7)),
        "Bob cannot record a reminder against Alice's business_id",
      );

      console.log("All gst.filing_reminders_sent RLS assertions passed.");
    },
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
