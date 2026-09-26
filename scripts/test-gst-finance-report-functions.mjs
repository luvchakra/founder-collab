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
                  .map((c) => `, ${dims[c] === undefined || dims[c] === null ? "null" : `'${dims[c]}'`}::${c === "party_id" ? "uuid" : "text"}`)
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

      console.log("FIN-6: seeding customers, suppliers, items and documents on the canonical core tables...");
      const party = (business, name) => psql(`insert into core.parties (business_id, name) values ('${business}', '${name}') returning id;`);
      const acme = party(alice, "Acme");
      const zenith = party(alice, "Zenith");
      const supplier = party(alice, "Steel Supplier");
      const landlord = party(alice, "Landlord");
      const bobCustomer = party(bob, "Bob Customer");
      const item = (business, name, kind) => psql(`insert into core.items (business_id, name, kind, sku) values ('${business}', '${name}', '${kind}', '${name.toUpperCase()}') returning id;`);
      const widget = item(alice, "Widget", "good");
      const install = item(alice, "Install", "service");
      /** A document with optional lines [itemId, qty, unitPrice]; header totals set directly
       * for a header-only one (no lines, so the recompute trigger never runs). */
      const doc = (business, type, partyId, date, status, header, lines = [], sourceRef = "{}") => {
        const id = psql(`insert into core.documents (business_id, doc_type, source_module, party_id, doc_date, status, subtotal, cgst_amount, sgst_amount, total_amount, source_ref, created_by)
          values ('${business}', '${type}', 'finance', '${partyId}', '${date}', '${status}', ${header.subtotal ?? 0}, ${header.cgst ?? 0}, ${header.sgst ?? 0}, ${header.total ?? 0}, '${sourceRef}', '${ALICE}') returning id;`);
        for (const [itemId, qty, price] of lines) {
          psql(`insert into core.document_lines (document_id, business_id, item_id, quantity, unit_price, tax_rate) values ('${id}', '${business}', '${itemId}', ${qty}, ${price}, 18);`);
        }
        return id;
      };
      doc(alice, "invoice", acme, "2026-09-03", "issued", {}, [[widget, 4, 250], [install, 1, 1000]]); // 2000 taxable
      doc(alice, "invoice", zenith, "2026-09-04", "issued", { subtotal: 500, cgst: 45, sgst: 45, total: 590 }); // header-only
      doc(alice, "credit_note", acme, "2026-09-20", "issued", {}, [[widget, 1, 250]]); // returns one widget
      doc(alice, "invoice", acme, "2026-09-21", "draft", {}, [[widget, 100, 250]]); // a draft is not a sale
      doc(alice, "invoice", acme, "2026-08-30", "issued", {}, [[widget, 9, 250]]); // outside the period
      doc(alice, "supplier_bill", supplier, "2026-09-06", "issued", { subtotal: 1000, cgst: 90, sgst: 90, total: 1180 }, [], '{"kind":"bill"}');
      doc(alice, "supplier_credit", supplier, "2026-09-16", "issued", { subtotal: 100, cgst: 9, sgst: 9, total: 118 });
      doc(alice, "supplier_bill", landlord, "2026-09-01", "issued", { subtotal: 20000, total: 20000 }, [], '{"kind":"expense"}');
      doc(bob, "invoice", bobCustomer, "2026-09-05", "issued", { subtotal: 777, total: 777 });

      console.log("FIN-6: sales_by_party nets credit notes and ignores drafts and other periods...");
      assertEqual(
        asAlice(`select string_agg(party_name || '=' || taxable_value || '/' || document_count, ',' order by party_name) from gst.sales_by_party(${P})`),
        "Acme=1750.00/1,Zenith=500.00/1",
        "Acme: 2000 invoiced less a 250 credit; Zenith's header-only invoice",
      );

      console.log("FIN-6: sales_by_item attributes lines to items and reports header-only sales once...");
      assertEqual(
        asAlice(`select string_agg(coalesce(item_name, '(not itemised)') || ':' || coalesce(item_kind, '-') || '=' || coalesce(quantity::text, '-') || '/' || sales_value, ',' order by coalesce(item_name, '')) from gst.sales_by_item(${P})`),
        "(not itemised):-=-/500.00,Install:service=1.00/1000.00,Widget:good=3.00/750.00",
        "3 widgets net of the return, one install, 500 unattributed",
      );

      console.log("FIN-6: purchases_by_party splits bills from expenses and nets supplier credits...");
      assertEqual(
        asAlice(`select string_agg(party_name || ':' || kind || '=' || total, ',' order by party_name) from gst.purchases_by_party(${P})`),
        "Landlord:expense=20000.00,Steel Supplier:bill=1062.00",
        "1180 bill less a 118 supplier credit; rent as an expense",
      );

      console.log("FIN-6 tenant isolation: nothing of Bob's reaches Alice, nothing of Alice's reaches Bob...");
      assertEqual(asAlice(`select count(*) from gst.sales_by_party('${bob}', null, null)`), "0", "sales_by_party across tenants");
      assertEqual(asAlice(`select count(*) from gst.sales_by_item('${bob}', null, null)`), "0", "sales_by_item across tenants");
      assertEqual(asBob(`select count(*) from gst.purchases_by_party(${P})`), "0", "purchases_by_party across tenants");
      assertEqual(asBob(`select string_agg(party_name, ',') from gst.sales_by_party('${bob}', null, null)`), "Bob Customer", "Bob's own sales");

      console.log("FIN-9: dimension_totals groups P&L activity by party, location or project, untagged lines included...");
      post(alice, "2026-09-15", [[a.ar, 3000, 0, { party_id: acme, location: "Pune" }], [a.sales, 0, 3000, { party_id: acme, location: "Pune", project_ref: "Fitout" }]], "posted", { party_id: null, location: null, project_ref: null });
      post(alice, "2026-09-16", [[a.rent, 800, 0, { location: " Pune " }], [a.ar, 0, 800]], "posted", { party_id: null, location: null, project_ref: null });
      post(alice, "2026-09-17", [[a.rent, 999, 0, { location: "Draftville" }], [a.ar, 0, 999]], "draft", { party_id: null, location: null, project_ref: null });
      assertEqual(
        asAlice(`select string_agg(coalesce(dimension_value, '(none)') || ':' || account_type || '=' || debit || '/' || credit, ',') from gst.dimension_totals('${alice}', 'location', '2026-09-15', '2026-09-30')`),
        "Pune:asset=3000.00/0.00,Pune:expense=800.00/0.00,Pune:income=0.00/3000.00,(none):asset=0.00/800.00",
        "trimmed location groups, untagged lines as their own group, drafts ignored",
      );
      assertEqual(
        asAlice(`select string_agg(coalesce(dimension_value, '(none)') || ':' || account_type, ',') from gst.dimension_totals('${alice}', 'project', '2026-09-15', '2026-09-30') where dimension_value is not null`),
        "Fitout:income",
        "project on the one line that carries it",
      );
      assertEqual(
        asAlice(`select count(*) from gst.dimension_totals('${alice}', 'party', '2026-09-15', '2026-09-30') where dimension_value = '${acme}'`),
        "2",
        "party dimension groups by the canonical core.parties id",
      );
      assertEqual(asAlice(`select count(*) from gst.dimension_totals('${alice}', 'colour', null, null)`), "0", "an unknown dimension returns nothing rather than erroring");
      assertEqual(asBob(`select count(*) from gst.dimension_totals('${alice}', 'location', null, null)`), "0", "dimension_totals across tenants");

      console.log("Licence gating: once Alice's Finance licence has expired, every aggregate returns nothing...");
      psql(`update core.licenses set status = 'expired' where business_id = '${alice}' and module_key = 'gst';`);
      assertEqual(asAlice(`select count(*) from gst.account_statement_totals(${P})`), "0", "statement totals gated by licence");
      assertEqual(asAlice(`select count(*) from gst.cash_flow_totals(${P})`), "0", "cash flow gated by licence");
      assertEqual(asAlice(`select count(*) from gst.sales_by_party(${P})`), "0", "sales_by_party gated by the Finance licence, though core.documents itself is not");
      assertEqual(asAlice(`select count(*) from gst.sales_by_item(${P})`), "0", "sales_by_item gated by licence");
      assertEqual(asAlice(`select count(*) from gst.purchases_by_party(${P})`), "0", "purchases_by_party gated by licence");
      assertEqual(asAlice(`select count(*) from gst.dimension_totals('${alice}', 'location', null, null)`), "0", "dimension_totals gated by licence");
      assertEqual(psql(`select count(*) from gst.journal_entries where business_id = '${alice}'`), "8", "the ledger itself is retained (ADR-9)");

      console.log("All Finance report-function assertions passed.");
    },
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
