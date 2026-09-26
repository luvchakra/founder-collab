#!/usr/bin/env node
/**
 * FIN-10: the deterministic Finance fixture set loads cleanly into a fresh, fully migrated
 * database, holds exactly what it promises, is reachable through RLS by its own owners
 * only, and can be loaded twice without duplicating anything. Loaded through the real CLI
 * (`seed-finance-fixtures.mjs`), so the refusal-guarded entry point is what is exercised.
 */
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { withTestDatabase } from "./lib/rls-test-harness.mjs";
import { FIXTURE_BUSINESSES, FIXTURE_COUNTS, FIXTURE_USERS, financeFixtureSql, fxId } from "./lib/finance-fixtures.mjs";
import { refusalFor } from "./seed-finance-fixtures.mjs";

const ROOT = new URL("..", import.meta.url).pathname;
const MIGRATIONS_DIR = join(ROOT, "supabase", "migrations");
const STUB_FILE = join(ROOT, "supabase", "tests", "local-stub.sql");
const PREFIX = "finance_fixtures_test";

async function main() {
  await withTestDatabase({
    dbNamePrefix: PREFIX,
    migrationsDir: MIGRATIONS_DIR,
    stubFile: STUB_FILE,
    testFn: async ({ psql, psqlAs, assertEqual, assertThrows }) => {
      const T = FIXTURE_BUSINESSES.traders;
      const S = FIXTURE_BUSINESSES.services;
      const asTraders = (sql) => psqlAs(FIXTURE_USERS.tradersOwner, sql);
      const asServices = (sql) => psqlAs(FIXTURE_USERS.servicesOwner, sql);
      const seed = () =>
        execFileSync("node", [join(ROOT, "scripts", "seed-finance-fixtures.mjs"), "--database", `${PREFIX}_${process.pid}`], { stdio: "pipe", env: process.env });

      console.log("The generator is deterministic and the CLI refuses anything but a local database...");
      assertEqual(financeFixtureSql(ROOT) === financeFixtureSql(ROOT), true, "two generations are byte-identical");
      assertEqual(refusalFor({ host: "db.xyz.supabase.co", database: "postgres" }) !== null, true, "hosted Supabase refused");
      assertEqual(refusalFor({ host: "10.0.0.5", database: "app" }) !== null, true, "non-local host refused");
      assertEqual(refusalFor({ host: "127.0.0.1", database: "app_production" }) !== null, true, "a prod-named database refused");
      assertEqual(refusalFor({ host: "127.0.0.1", database: "local_test" }), null, "a local test database accepted");

      console.log("Loading the fixture set...");
      seed();
      psql(`grant usage on schema core to authenticated; grant select, insert, update, delete on all tables in schema core to authenticated; grant usage on schema gst to authenticated;`);

      const count = (sql) => asTraders(sql);
      const c = FIXTURE_COUNTS.traders;
      console.log("Fixture Traders holds exactly what the fixture promises (read as its owner, through RLS)...");
      const docs = (type, extra = "") => count(`select count(*) from core.documents where business_id = '${T}' and doc_type = '${type}' ${extra}`);
      assertEqual(docs("invoice"), c.invoices, "30 invoices");
      assertEqual(docs("supplier_bill", "and source_ref->>'kind' = 'bill'"), c.supplierBills, "20 supplier bills");
      assertEqual(docs("supplier_bill", "and source_ref->>'kind' = 'expense'"), c.expenses, "20 expenses");
      assertEqual(docs("credit_note"), c.creditNotes, "3 credit notes");
      assertEqual(docs("debit_note"), c.debitNotes, "2 debit notes");
      assertEqual(count(`select count(*) from core.payments where business_id = '${T}'`), c.payments, "25 payments");
      assertEqual(count(`select count(*) from core.payments p where business_id = '${T}' and not exists (select 1 from core.payment_allocations a where a.payment_id = p.id)`), "0", "every payment is allocated");
      assertEqual(count(`select count(*) from gst.bank_transactions where business_id = '${T}'`), c.bankTransactions, "12 bank lines");
      assertEqual(count(`select count(*) from gst.recurring_entries where business_id = '${T}'`), c.recurringEntries, "2 recurring entries");
      assertEqual(count(`select count(*) from gst.bank_rules where business_id = '${T}'`), c.bankRules, "2 bank rules");
      assertEqual(count(`select count(*) from gst.gstr2b_documents where business_id = '${T}'`), c.gstr2bDocuments, "6 GSTR-2B records");
      assertEqual(count(`select count(*) from gst.accounts where business_id = '${T}'`), count(`select count(*) from gst.accounts where business_id = '${T}' and (parent_account_id is null or parent_account_id in (select id from gst.accounts where business_id = '${T}'))`), "the chart is a well-formed tree");
      assertEqual(count(`select count(*) from gst.account_mappings where business_id = '${T}'`), "10", "every posting role is mapped");

      console.log("Canonical masters reused, not duplicated: customers and suppliers are parties with roles, products are items...");
      assertEqual(count(`select count(*) from core.party_roles where business_id = '${T}' and role = 'customer'`), "5", "5 customers");
      assertEqual(count(`select count(*) from core.party_roles where business_id = '${T}' and role = 'supplier'`), "4", "4 suppliers");
      assertEqual(count(`select string_agg(kind || '=' || n, ',' order by kind) from (select kind, count(*) n from core.items where business_id = '${T}' group by kind) k`), "good=4,service=2", "4 goods, 2 services");
      assertEqual(count(`select count(*) from core.documents d where business_id = '${T}' and doc_type = 'invoice' and total_amount <> (select sum(quantity * unit_price + cgst_amount + sgst_amount + igst_amount) from core.document_lines l where l.document_id = d.id)`), "0", "every invoice total is its lines' total");
      assertEqual(count(`select count(*) from core.documents where business_id = '${T}' and doc_type = 'invoice' and igst_amount > 0 and cgst_amount = 0`), "6", "inter-state invoices carry IGST only");

      console.log("Scenarios: locked period, failed e-invoice, partial and over payment, 2B matched/mismatched/missing, duplicates...");
      assertEqual(count(`select status from gst.accounting_periods where business_id = '${T}' and start_date = '2026-04-01'`), "locked", "April 2026 is locked");
      assertEqual(count(`select count(*) from core.documents where business_id = '${T}' and doc_type = 'invoice' and doc_date between '2026-04-01' and '2026-04-30'`), "5", "five invoices sit in the locked month");
      assertEqual(count(`select count(*) from core.domain_events where business_id = '${T}' and type = 'document.issued' and status = 'failed' and last_error is not null`), "1", "one failed e-invoice attempt");
      assertEqual(count(`select count(*) from gst.einvoices e join core.domain_events ev on ev.payload->>'invoiceId' = e.document_id::text where e.business_id = '${T}' and ev.status = 'failed'`), "0", "and no IRN for it");
      assertEqual(count(`select count(*) from gst.einvoices where business_id = '${T}' and status = 'generated'`), "1", "one generated IRN");
      assertEqual(count(`select count(*) from (select d.id from core.documents d join core.payment_allocations a on a.document_id = d.id where d.business_id = '${T}' and d.doc_type = 'invoice' group by d.id, d.total_amount having sum(a.amount) < d.total_amount) x`), "1", "one part-paid invoice");
      assertEqual(count(`select count(*) from (select d.id from core.documents d join core.payment_allocations a on a.document_id = d.id where d.business_id = '${T}' and d.doc_type = 'invoice' group by d.id, d.total_amount having sum(a.amount) > d.total_amount) x`), "1", "one overpaid invoice");
      const twoB = (kind) => count(`
        select count(*) from gst.gstr2b_documents g
        where g.business_id = '${T}' and ${kind === "missing" ? "not " : ""}exists (
          select 1 from core.documents b join core.tax_identities t on t.party_id = b.party_id
          where b.business_id = '${T}' and b.doc_type = 'supplier_bill' and t.gstin = g.supplier_gstin
            and b.source_ref->>'supplier_invoice_number' = g.document_number
            ${kind === "matched" ? "and b.subtotal = g.taxable_value" : kind === "mismatched" ? "and b.subtotal <> g.taxable_value" : ""})`);
      assertEqual(twoB("matched"), "2", "2B: two records match the books");
      assertEqual(twoB("mismatched"), "2", "2B: two records disagree with the books on value");
      assertEqual(twoB("missing"), "2", "2B: two records the books never booked");
      assertEqual(count(`select count(*) from core.domain_events where business_id = '${T}' and type = 'document.issued' and payload->>'invoiceId' = '${fxId(`${T}:invoice:21`)}'`), "2", "the same issue event delivered twice");
      assertEqual(count(`select count(*) from (select source_ref->>'supplier_invoice_number' from core.documents where business_id = '${T}' and doc_type = 'supplier_bill' and source_ref ? 'supplier_invoice_number' group by party_id, 1 having count(*) > 1) x`), "1", "one supplier invoice number booked twice");
      assertEqual(count(`select count(*) from gst.bank_transactions where business_id = '${T}' and description = 'UPI IN CASH SALE COUNTER'`), "2", "two look-alike bank lines, different references");
      assertThrows(
        () => asTraders(`insert into gst.bank_transactions (business_id, bank_account_id, txn_date, description, reference, amount, import_fingerprint)
          select business_id, bank_account_id, txn_date, description, reference, amount, import_fingerprint from gst.bank_transactions
          where business_id = '${T}' and reference = 'UPI-7781'`),
        "re-importing a line with the same fingerprint is refused",
      );
      assertEqual(count(`select count(*) from gst.journal_entries where business_id = '${T}'`), "0", "no journal entries seeded: the history awaits the backfill");

      console.log("Fixture Services: its own smaller set and its licence combination...");
      assertEqual(asServices(`select count(*) from core.documents where business_id = '${S}' and doc_type = 'invoice'`), String(FIXTURE_COUNTS.services.invoices), "5 invoices");
      assertEqual(asServices(`select count(*) from core.documents where business_id = '${S}' and doc_type = 'supplier_bill'`), String(FIXTURE_COUNTS.services.supplierBills), "3 bills");
      assertEqual(asServices(`select count(*) from core.payments where business_id = '${S}'`), String(FIXTURE_COUNTS.services.payments), "2 payments");
      assertEqual(asServices(`select string_agg(module_key || '=' || status, ',' order by module_key) from core.licenses where business_id = '${S}'`), "gst=active,inventory=grace", "Finance active, Inventory in its grace period");
      assertEqual(psql(`select string_agg(module_key, ',' order by module_key) from core.licenses where business_id = '${T}' and status = 'active'`), "fsm,gst,inventory", "Traders licensed for Finance, Inventory and Service");

      console.log("Tenant isolation: neither owner sees the other's fixture data...");
      assertEqual(asServices(`select count(*) from core.documents where business_id = '${T}'`), "0", "Services' owner sees none of Traders' documents");
      assertEqual(asServices(`select count(*) from gst.bank_rules where business_id = '${T}'`), "0", "nor its bank rules");
      assertEqual(asTraders(`select count(*) from core.payments where business_id = '${S}'`), "0", "Traders' owner sees none of Services' payments");

      console.log("Loading again changes nothing (fixed ids, on conflict do nothing)...");
      const before = psql(`select (select count(*) from core.documents) || '|' || (select count(*) from core.document_lines) || '|' || (select count(*) from core.payment_allocations) || '|' || (select count(*) from gst.bank_transactions)`);
      seed();
      assertEqual(psql(`select (select count(*) from core.documents) || '|' || (select count(*) from core.document_lines) || '|' || (select count(*) from core.payment_allocations) || '|' || (select count(*) from gst.bank_transactions)`), before, "second load is a no-op");

      console.log("All Finance fixture assertions passed.");
    },
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
