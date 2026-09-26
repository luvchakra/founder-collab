#!/usr/bin/env node
/**
 * FIN-11 — the §53 edge cases not yet covered end to end, against real Postgres with the
 * whole migration timeline applied:
 *
 *  1. Licence cancellation and reactivation (ADR-9): the Finance ledger stays readable but
 *     not writable through the 30-day grace, the drain's own write gate
 *     (`core.has_module_write`) closes, events for an unlicensed Finance park and are
 *     replayed on reactivation, expiry hides but never deletes, and reactivation restores
 *     reads and writes.
 *  2. Historical backfill: postings dated in a locked period are refused by the database
 *     itself; the same history dated in an open period posts.
 *  3. Duplicate backfill: a second posting with the same idempotency key is refused, the
 *     same key in another business is not.
 *  4. Negative inventory: stock can go negative (oversold), is read back as negative by the
 *     query Inventory's valuation contract uses, and never blocks the sale's posting.
 *
 * The TypeScript half — the real posting path under a historical and a repeated backfill,
 * and during grace — is `packages/module-gst/src/lib/backfill/edge-cases.test.ts`; the
 * negative-stock valuation rule is in `lib/operational-reports/derive.test.ts`.
 */
import { join } from "node:path";
import { withTestDatabase } from "./lib/rls-test-harness.mjs";

const ROOT = new URL("..", import.meta.url).pathname;
const MIGRATIONS_DIR = join(ROOT, "supabase", "migrations");
const STUB_FILE = join(ROOT, "supabase", "tests", "local-stub.sql");

const ALICE = "11111111-1111-1111-1111-111111111111";
const BOB = "22222222-2222-2222-2222-222222222222";

async function main() {
  await withTestDatabase({
    dbNamePrefix: "finance_e2e_edge_cases_test",
    migrationsDir: MIGRATIONS_DIR,
    stubFile: STUB_FILE,
    testFn: async ({ psql, psqlAs, assertEqual, assertThrows }) => {
      const asAlice = (sql) => psqlAs(ALICE, sql);

      console.log("Seeding two businesses with Finance and Inventory, a chart, a locked April...");
      psql(`
        insert into auth.users (id, email) values ('${ALICE}', 'alice@example.com'), ('${BOB}', 'bob@example.com');
        grant usage on schema core to authenticated;
        grant select, insert, update, delete on all tables in schema core to authenticated;
        grant usage on schema gst to authenticated;
        grant usage on schema inventory to authenticated;
      `);
      const alice = psql(`insert into core.businesses (account_id, name)
        select account_id, 'Alice Co' from core.account_members where user_id = '${ALICE}' returning id;`);
      const bob = psql(`insert into core.businesses (account_id, name)
        select account_id, 'Bob Co' from core.account_members where user_id = '${BOB}' returning id;`);
      psql(`
        insert into core.business_members (business_id, user_id, role) values ('${alice}', '${ALICE}', 'owner'), ('${bob}', '${BOB}', 'owner')
        on conflict do nothing;
        insert into core.licenses (account_id, business_id, module_key, status)
        select b.account_id, b.id, m.key, 'active' from core.businesses b cross join (values ('gst'), ('inventory')) m(key)
        where b.id in ('${alice}', '${bob}');
      `);
      const account = (business, number, type) =>
        psql(`insert into gst.accounts (business_id, account_number, name, type) values ('${business}', '${number}', 'A${number}', '${type}') returning id;`);
      const ar = account(alice, "1300", "asset");
      const sales = account(alice, "4100", "income");
      const bobAr = account(bob, "1300", "asset");
      const bobSales = account(bob, "4100", "income");
      psql(`
        insert into gst.accounting_periods (business_id, fiscal_year, start_date, end_date, status) values
          ('${alice}', 2026, '2026-04-01', '2026-04-30', 'locked'),
          ('${alice}', 2026, '2026-05-01', '2026-05-31', 'open');
      `);

      /** The shape an automatic posting takes: keyed, sourced, balanced. */
      const postAs = (who, business, date, key, arAcc = ar, salesAcc = sales) =>
        psqlAs(who, `
          with e as (
            insert into gst.journal_entries (business_id, posting_date, status, source_module, source_entity_type, idempotency_key, posting_rule_key, posting_rule_version)
            values ('${business}', '${date}', 'posted', 'inventory', 'invoice', '${key}', 'invoice.finalized', 1) returning id
          ), l as (
            insert into gst.journal_lines (business_id, entry_id, line_number, account_id, debit, credit)
            select '${business}', e.id, v.n, v.a::uuid, v.d, v.c from e, (values (1, '${arAcc}', 1180, 0), (2, '${salesAcc}', 0, 1180)) v(n, a, d, c)
          )
          select id from e`);

      // ---------------------------------------------------------------------------------
      console.log("2. Historical backfill: the database refuses a posting dated in a locked period...");
      assertThrows(() => postAs(ALICE, alice, "2026-04-15", "document:inv-april"), "posting into locked April refused by the period trigger");
      assertEqual(asAlice(`select count(*) from gst.journal_entries where idempotency_key = 'document:inv-april'`), "0", "nothing half-written");
      const may = postAs(ALICE, alice, "2026-05-15", "document:inv-may");
      assertEqual(may.length, 36, "the same history dated in an open period posts");
      assertEqual(asAlice(`select count(*) from gst.journal_entries where posting_date = '2026-03-10'`), "0", "(no period covers March yet)");
      assertEqual(postAs(ALICE, alice, "2026-03-10", "document:inv-march").length, 36, "a date before any period exists posts: nothing to lock against");

      // ---------------------------------------------------------------------------------
      console.log("3. Duplicate backfill: the idempotency key refuses a second posting of the same document...");
      assertThrows(() => postAs(ALICE, alice, "2026-05-15", "document:inv-may"), "second posting with the same key refused");
      assertEqual(asAlice(`select count(*) from gst.journal_entries where idempotency_key = 'document:inv-may'`), "1", "exactly one entry");
      assertEqual(postAs(BOB, bob, "2026-05-15", "document:inv-may", bobAr, bobSales).length, 36, "the same key in another business is that business's own posting");

      // ---------------------------------------------------------------------------------
      console.log("1. Licence cancellation and reactivation (ADR-9)...");
      psql(`update core.licenses set status = 'grace', deactivated_at = now(), grace_ends_at = now() + interval '30 days'
            where business_id = '${alice}' and module_key = 'gst';`);
      assertEqual(asAlice(`select count(*) from gst.journal_entries`), "2", "grace: the ledger is still readable");
      assertEqual(asAlice(`select count(*) from gst.account_statement_totals('${alice}', null, null)`), "2", "grace: statements still read");
      assertThrows(() => postAs(ALICE, alice, "2026-05-20", "document:during-grace"), "grace: no new postings");
      assertEqual(psql(`select core.has_module_write('${alice}', 'gst')::text`), "false", "grace: the drain's write gate is closed");
      assertEqual(psql(`select core.has_module('${alice}', 'gst')::text`), "true", "grace: the read gate is open");

      console.log("   ...events needing Finance park while it is unlicensed, and replay on reactivation...");
      psql(`update core.licenses set status = 'expired' where business_id = '${alice}' and module_key = 'gst';`);
      assertEqual(asAlice(`select count(*) from gst.journal_entries`), "0", "expired: the ledger is denied");
      assertEqual(asAlice(`select count(*) from gst.dimension_settings`), "0", "expired: so is every Finance table");
      assertEqual(psql(`select count(*) from gst.journal_entries where business_id = '${alice}'`), "2", "expired: but nothing is deleted");
      const event = psql(`insert into core.domain_events (business_id, type, required_module, payload)
        values ('${alice}', 'document.issued', 'gst', '{"invoiceId": "inv-late"}') returning id;`);
      // The drain parks an event whose module is unlicensed (record_domain_event_attempt 'parked').
      psql(`select core.record_domain_event_attempt('${event}', 'parked');`);
      assertEqual(psql(`select status from core.domain_events where id = '${event}'`), "parked", "the event waits rather than failing");
      psql(`update core.licenses set status = 'active', deactivated_at = null, grace_ends_at = null, activated_at = now()
            where business_id = '${alice}' and module_key = 'gst';`);
      assertEqual(psql(`select core.replay_parked_events('${alice}', 'gst')`), "1", "reactivation replays the parked event");
      assertEqual(psql(`select status from core.domain_events where id = '${event}'`), "pending", "it is due for the drain again");
      assertEqual(asAlice(`select count(*) from gst.journal_entries`), "2", "reactivated: everything is back, nothing recreated");
      assertEqual(postAs(ALICE, alice, "2026-05-21", "document:after-reactivation").length, 36, "reactivated: writes work again");
      assertEqual(psql(`select count(*) from gst.journal_entries where business_id = '${bob}'`), "1", "Bob's ledger was never touched");

      // ---------------------------------------------------------------------------------
      console.log("4. Negative inventory: oversold stock is allowed, read back as negative, and never blocks the sale's posting...");
      const warehouse = psql(`insert into inventory.warehouses (business_id, name, code) values ('${alice}', 'Main', 'MAIN') returning id;`);
      const widget = psql(`insert into core.items (business_id, name, kind, cost_price, selling_price) values ('${alice}', 'Widget', 'good', 60, 100) returning id;`);
      psql(`insert into inventory.stock_levels (business_id, item_id, warehouse_id, quantity) values ('${alice}', '${widget}', '${warehouse}', 2);`);
      // Five sold against two on hand.
      psql(`update inventory.stock_levels set quantity = quantity - 5 where item_id = '${widget}';`);
      assertEqual(
        asAlice(`select sum(quantity) from inventory.stock_levels where business_id = '${alice}' and item_id = '${widget}'`),
        "-3.00",
        "the position the valuation contract reads is negative, not clamped to zero",
      );
      assertEqual(postAs(ALICE, alice, "2026-05-22", "document:oversold-invoice").length, 36, "the invoice for the oversold goods still posts");

      console.log("All Finance end-to-end edge-case assertions passed.");
    },
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
