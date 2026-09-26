#!/usr/bin/env node
/**
 * The Finance report aggregates, against real Postgres: tenant isolation, licence gating and
 * the arithmetic each one exists for.
 *
 *  - FIN-5: `gst.account_statement_totals` (period AND as-at totals in one read, cash
 *    accounts flagged) and `gst.cash_flow_totals` (direct-method cash flow, attributed to
 *    the counter account, reconciling to the change in cash by construction).
 *  - FIN-6: `gst.sales_by_party`, `gst.sales_by_item`, `gst.purchases_by_party`.
 *  - FIN-9: `gst.dimension_totals`.
 *
 * Every function is SECURITY INVOKER, so RLS decides what a caller sees: another
 * business's figures, or any figures once the Finance licence has lapsed past its grace
 * period, come back as nothing.
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
    dbNamePrefix: "gst_finance_report_functions_test",
    migrationsDir: MIGRATIONS_DIR,
    stubFile: STUB_FILE,
    testFn: async ({ psql, psqlAs, assertEqual }) => {
      const asAlice = (sql) => psqlAs(ALICE, sql);
      const asBob = (sql) => psqlAs(BOB, sql);

      console.log("Seeding two businesses, each licensed for Finance...");
      psql(`
        insert into auth.users (id, email) values ('${ALICE}', 'alice@example.com'), ('${BOB}', 'bob@example.com');
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
          ('${alice}', '${ALICE}', 'owner'), ('${bob}', '${BOB}', 'owner')
        on conflict do nothing;
        insert into core.licenses (account_id, business_id, module_key, status)
        select account_id, id, 'gst', 'active' from core.businesses where id in ('${alice}', '${bob}');
      `);

      const account = (business, number, name, type, subtype = null) =>
        psql(`insert into gst.accounts (business_id, account_number, name, type, subtype)
          values ('${business}', '${number}', '${name}', '${type}', ${subtype ? `'${subtype}'` : "null"}) returning id;`);
      const a = {
        bank: account(alice, "1100", "Bank", "asset"),
        ar: account(alice, "1300", "Accounts Receivable", "asset"),
        fixed: account(alice, "1500", "Fixed Assets", "asset"),
        capital: account(alice, "3100", "Owner Capital", "equity"),
        sales: account(alice, "4100", "Product Sales", "income"),
        rent: account(alice, "6200", "Rent", "expense"),
      };
      const bobBank = account(bob, "1100", "Bank", "asset");
      const bobCapital = account(bob, "3100", "Owner Capital", "equity");
      psql(`
        insert into gst.account_mappings (business_id, role_key, account_id) values
          ('${alice}', 'bank', '${a.bank}'), ('${bob}', 'bank', '${bobBank}');
      `);

      /** One balanced entry; lines are [accountId, debit, credit, extra columns?]. */
      let n = 0;
      const post = (business, date, lines, status = "posted", extra = {}) => {
        n += 1;
        const cols = Object.keys(extra);
        psql(`
          with e as (
            insert into gst.journal_entries (business_id, entry_number, posting_date, status, memo)
            values ('${business}', 'JE-${n}', '${date}', '${status}', 'entry ${n}') returning id
          )
          insert into gst.journal_lines (business_id, entry_id, line_number, account_id, debit, credit${cols.map((c) => `, ${c}`).join("")})
          select '${business}', e.id, v.n, v.account_id::uuid, v.debit, v.credit${cols.map((c) => `, v.${c}`).join("")}
          from e, (values ${lines
            .map(
              ([acc, dr, cr, dims = {}], i) =>
                `(${i + 1}, '${acc}', ${dr}::numeric, ${cr}::numeric${cols
                  .map((c) => `, ${dims[c] === undefined || dims[c] === null ? "null" : `'${dims[c]}'`}`)
                  .join("")})`,
            )
            .join(", ")}) as v(n, account_id, debit, credit${cols.map((c) => `, ${c}`).join("")});
        `);
      };

      post(alice, "2026-04-10", [[a.bank, 100000, 0], [a.capital, 0, 100000]]); // before the period
      post(alice, "2026-09-02", [[a.ar, 10000, 0], [a.sales, 0, 10000]]); // an invoice: no cash
      post(alice, "2026-09-05", [[a.bank, 6000, 0], [a.ar, 0, 6000]]); // part-paid
      post(alice, "2026-09-10", [[a.rent, 2000, 0], [a.fixed, 30000, 0], [a.bank, 0, 32000]]); // one payment, two reasons
      post(alice, "2026-09-12", [[a.bank, 999, 0], [a.sales, 0, 999]], "draft"); // a draft is not the ledger
      post(bob, "2026-09-03", [[bobBank, 5000, 0], [bobCapital, 0, 5000]]);

      const P = `'${alice}', '2026-09-01', '2026-09-30'`;

      console.log("FIN-5: account_statement_totals reads the period and the position as at its end...");
      assertEqual(
        asAlice(`select debit || '|' || credit || '|' || debit_to_date || '|' || credit_to_date || '|' || is_cash
                 from gst.account_statement_totals(${P}) where account_number = '1100'`),
        "6000.00|32000.00|106000.00|32000.00|true",
        "bank: period activity, activity to date, flagged as cash (draft ignored)",
      );
      assertEqual(
        asAlice(`select is_cash::text from gst.account_statement_totals(${P}) where account_number = '1300'`),
        "false",
        "receivables are not cash",
      );

      console.log("FIN-5: cash_flow_totals attributes each cash movement to the account on the other side...");
      assertEqual(
        asAlice(`select string_agg(account_number || '=' || amount, ',' order by account_number) from gst.cash_flow_totals(${P})`),
        "1300=6000.00,1500=-30000.00,6200=-2000.00",
        "receipt from customers, the asset bought, the rent paid; the invoice itself moved no cash",
      );
      assertEqual(
        asAlice(`select sum(amount) from gst.cash_flow_totals(${P})`),
        "-26000.00",
        "flows sum to the change in cash (6000 in, 32000 out)",
      );

      console.log("Tenant isolation: Alice asking about Bob's business gets nothing, Bob sees only his own...");
      assertEqual(asAlice(`select count(*) from gst.account_statement_totals('${bob}', null, null)`), "0", "no statement totals across tenants");
      assertEqual(asAlice(`select count(*) from gst.cash_flow_totals('${bob}', null, null)`), "0", "no cash flow across tenants");
      assertEqual(asBob(`select count(*) from gst.cash_flow_totals(${P})`), "0", "Bob cannot read Alice's cash flow");
      assertEqual(
        asBob(`select string_agg(account_number || '=' || amount, ',') from gst.cash_flow_totals('${bob}', '2026-09-01', '2026-09-30')`),
        "3100=5000.00",
        "Bob's own cash flow is his alone",
      );

      globalThis.__finReportCtx = { psql, asAlice, asBob, alice, bob, a, post, P, assertEqual };
      await runLaterSections(globalThis.__finReportCtx);

      console.log("Licence gating: once Alice's Finance licence has expired, every aggregate returns nothing...");
      psql(`update core.licenses set status = 'expired' where business_id = '${alice}' and module_key = 'gst';`);
      assertEqual(asAlice(`select count(*) from gst.account_statement_totals(${P})`), "0", "statement totals gated by licence");
      assertEqual(asAlice(`select count(*) from gst.cash_flow_totals(${P})`), "0", "cash flow gated by licence");
      await runGatedChecks(globalThis.__finReportCtx);
      assertEqual(psql(`select count(*) from gst.journal_entries where business_id = '${alice}'`), "5", "the ledger itself is retained (ADR-9)");

      console.log("All Finance report-function assertions passed.");
    },
  });
}

/** FIN-6/FIN-9 sections are appended here as their functions land. */
async function runLaterSections() {}
async function runGatedChecks() {}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
