/**
 * FIN-10 — the deterministic Finance fixture set (§52), as SQL.
 *
 * Deterministic in every respect: ids are derived from a fixed key (`fxId`), dates and
 * amounts from the row's index, never from the clock or a random source — so two runs give
 * byte-identical data, a test can assert exact figures, and re-running the seed is a no-op
 * (`on conflict do nothing` on those fixed ids).
 *
 * Everything lands in the canonical tables every module already uses — customers and
 * suppliers are `core.parties` with `core.party_roles`, products and services are
 * `core.items`, invoices/bills/notes are `core.documents`, money is `core.payments` +
 * `core.payment_allocations`. No parallel Finance master is created (CLAUDE.md
 * non-negotiable #5). Journal entries are deliberately NOT seeded: the fixture is a
 * business's operational history before Finance posted any of it, which is exactly what
 * FIN-2's backfill exists to post (the "historical backfill" scenario) — seeding entries
 * by hand would be a second posting path that could disagree with the real one.
 *
 * What it contains (business "Fixture Traders" unless noted):
 *   - 2 businesses; licence combinations: Traders = Finance + Inventory + Service, all
 *     active; Services = Finance active + Inventory cancelled and in its read-only grace
 *     period (+ CRM never licensed)
 *   - the default chart of accounts and role mappings for both (read from
 *     `chart-of-accounts.ts`, so it cannot drift from what provisioning creates), a bank
 *     account, FY 2026-27 monthly periods with April 2026 LOCKED
 *   - 5 customers, 4 suppliers (GSTINs on the GST-registered ones), 4 goods + 2 services
 *   - 30 invoices (itemised, intra- and inter-state GST), 20 supplier bills, 20 expenses,
 *     3 credit notes, 2 debit notes, 2 purchase orders
 *   - 25 payments (15 customer receipts incl. partial and one overpayment, 10 supplier
 *     payments), each allocated
 *   - 12 bank statement lines, 2 bank rules, 2 recurring entries
 *   - a GSTR-2B statement for 2026-08 with matched, mismatched and missing-in-books records
 *   - a GSTR-1 return period for April 2026 marked filed
 *   - one generated e-invoice, and one FAILED e-invoice attempt (a `document.issued` event
 *     the drain marked failed, which is the only durable trace a failed GSP call leaves)
 *   - duplicate scenarios: the same `document.issued` event delivered twice; two bank lines
 *     identical but for their reference (looks like a double import, is two payments); a
 *     supplier who billed the same supplier-invoice number twice
 *   - business "Fixture Services": 5 invoices, 3 bills, 2 payments
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/** A stable uuid for a fixture key: same key, same id, every run. */
export function fxId(key) {
  const h = createHash("md5").update(`finance-fixture:${key}`).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

export const FIXTURE_USERS = {
  tradersOwner: fxId("user:traders-owner"),
  tradersAccountant: fxId("user:traders-accountant"),
  servicesOwner: fxId("user:services-owner"),
};

export const FIXTURE_BUSINESSES = {
  traders: fxId("business:traders"),
  services: fxId("business:services"),
};

/** The counts the fixture promises — asserted by scripts/test-finance-fixtures.mjs. */
export const FIXTURE_COUNTS = {
  traders: {
    invoices: 30,
    supplierBills: 20,
    expenses: 20,
    creditNotes: 3,
    debitNotes: 2,
    payments: 25,
    bankTransactions: 12,
    recurringEntries: 2,
    bankRules: 2,
    gstr2bDocuments: 6,
  },
  services: { invoices: 5, supplierBills: 3, payments: 2 },
};

/** The default chart and role mappings, parsed from the TypeScript that provisioning
 * uses, so the fixture's chart is the real one and cannot drift from it. */
export function readDefaultChart(root) {
  const source = readFileSync(join(root, "packages/module-gst/src/lib/accounting/chart-of-accounts.ts"), "utf8");
  const accounts = [...source.matchAll(/\{ accountNumber: "(\d+)", name: "([^"]+)", type: "(\w+)", parent: (null|"\d+"), isSystem: (true|false) \}/g)].map(
    (m) => ({ number: m[1], name: m[2], type: m[3], parent: m[4] === "null" ? null : m[4].replace(/"/g, ""), isSystem: m[5] === "true" }),
  );
  const rolesBlock = source.slice(source.indexOf("DEFAULT_ACCOUNT_ROLES"));
  const roles = [...rolesBlock.matchAll(/^\s+(\w+): "(\d+)",$/gm)].map((m) => ({ role: m[1], number: m[2] }));
  if (accounts.length < 30 || roles.length < 10) throw new Error("Could not read the default chart of accounts.");
  return { accounts, roles };
}

const q = (v) => (v === null || v === undefined ? "null" : `'${String(v).replace(/'/g, "''")}'`);
const round2 = (n) => Math.round(n * 100) / 100;
function addDays(iso, days) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
const pad = (n) => String(n).padStart(3, "0");

function chartSql(business, chart) {
  const out = [];
  // Parents first: the chart lists them before their children.
  for (const a of chart.accounts) {
    out.push(`insert into gst.accounts (id, business_id, account_number, name, type, parent_account_id, is_system)
      values (${q(fxId(`${business}:account:${a.number}`))}, ${q(business)}, ${q(a.number)}, ${q(a.name)}, ${q(a.type)},
      ${a.parent ? q(fxId(`${business}:account:${a.parent}`)) : "null"}, ${a.isSystem}) on conflict do nothing;`);
  }
  for (const r of chart.roles) {
    out.push(`insert into gst.account_mappings (business_id, role_key, account_id)
      values (${q(business)}, ${q(r.role)}, ${q(fxId(`${business}:account:${r.number}`))}) on conflict do nothing;`);
  }
  return out;
}

function periodsSql(business, lockedMonth) {
  const out = [];
  for (let m = 0; m < 12; m++) {
    const start = new Date(Date.UTC(2026, 3 + m, 1));
    const end = new Date(Date.UTC(2026, 4 + m, 0));
    const s = start.toISOString().slice(0, 10);
    const e = end.toISOString().slice(0, 10);
    const status = s.slice(0, 7) === lockedMonth ? "locked" : "open";
    out.push(`insert into gst.accounting_periods (id, business_id, fiscal_year, start_date, end_date, gst_period, status)
      values (${q(fxId(`${business}:period:${s}`))}, ${q(business)}, 2026, ${q(s)}, ${q(e)}, ${q(s.slice(0, 7))}, ${q(status)}) on conflict do nothing;`);
  }
  return out;
}

/** One document with optional lines; tax per line at `rate`, split CGST/SGST unless
 * `interState`. Header-only documents pass totals in `header`. */
function documentSql(business, owner, doc) {
  const out = [];
  const lines = doc.lines ?? [];
  const header = doc.header ?? { subtotal: 0, cgst: 0, sgst: 0, igst: 0 };
  const total = round2(header.subtotal + header.cgst + header.sgst + header.igst);
  out.push(`insert into core.documents (id, business_id, doc_type, source_module, source_ref, party_id, number, status, doc_date, due_date,
      subtotal, cgst_amount, sgst_amount, igst_amount, total_amount, created_by)
    values (${q(doc.id)}, ${q(business)}, ${q(doc.type)}, ${q(doc.module)}, ${q(JSON.stringify(doc.sourceRef ?? {}))}::jsonb, ${q(doc.party)},
      ${q(doc.number)}, ${q(doc.status)}, ${q(doc.date)}, ${q(doc.due ?? null)},
      ${lines.length ? 0 : header.subtotal}, ${lines.length ? 0 : header.cgst}, ${lines.length ? 0 : header.sgst}, ${lines.length ? 0 : header.igst},
      ${lines.length ? 0 : total}, ${q(owner)})
    on conflict do nothing;`);
  lines.forEach((l, i) => {
    const value = round2(l.qty * l.price);
    const tax = round2((value * l.rate) / 100);
    const [cgst, sgst, igst] = doc.interState ? [0, 0, tax] : [round2(tax / 2), round2(tax - round2(tax / 2)), 0];
    out.push(`insert into core.document_lines (id, document_id, business_id, item_id, quantity, unit_price, tax_rate, cgst_amount, sgst_amount, igst_amount, sort_order)
      select ${q(fxId(`${doc.id}:line:${i}`))}, ${q(doc.id)}, ${q(business)}, ${q(l.item)}, ${l.qty}, ${l.price}, ${l.rate}, ${cgst}, ${sgst}, ${igst}, ${i}
      where not exists (select 1 from core.document_lines where id = ${q(fxId(`${doc.id}:line:${i}`))});`);
  });
  return out;
}

function paymentSql(business, owner, p) {
  return [
    `insert into core.payments (id, business_id, party_id, method, amount, reference, payment_date, created_by)
      values (${q(p.id)}, ${q(business)}, ${q(p.party)}, ${q(p.method)}, ${p.amount}, ${q(p.reference)}, ${q(p.date)}, ${q(owner)}) on conflict do nothing;`,
    ...p.allocations.map(
      (a, i) => `insert into core.payment_allocations (id, business_id, payment_id, document_id, amount)
        values (${q(fxId(`${p.id}:alloc:${i}`))}, ${q(business)}, ${q(p.id)}, ${q(a.document)}, ${a.amount}) on conflict do nothing;`,
    ),
  ];
}

/** Invoice totals as `core.recompute_document_totals` will compute them from the lines. */
function invoiceTotal(doc) {
  if (!doc.lines?.length) return round2(doc.header.subtotal + doc.header.cgst + doc.header.sgst + doc.header.igst);
  return round2(doc.lines.reduce((s, l) => s + round2(l.qty * l.price) + round2((round2(l.qty * l.price) * l.rate) / 100), 0));
}

export function financeFixtureSql(root) {
  const chart = readDefaultChart(root);
  const T = FIXTURE_BUSINESSES.traders;
  const S = FIXTURE_BUSINESSES.services;
  const { tradersOwner, tradersAccountant, servicesOwner } = FIXTURE_USERS;
  const acct = (business, number) => fxId(`${business}:account:${number}`);
  const sql = [];

  // --- Users, businesses, members, licences ---------------------------------------
  sql.push(`insert into auth.users (id, email) values
    (${q(tradersOwner)}, 'owner@traders.fixture.test'),
    (${q(tradersAccountant)}, 'accountant@traders.fixture.test'),
    (${q(servicesOwner)}, 'owner@services.fixture.test') on conflict do nothing;`);
  sql.push(`insert into core.businesses (id, account_id, name)
    select ${q(T)}, account_id, 'Fixture Traders' from core.account_members where user_id = ${q(tradersOwner)} on conflict do nothing;`);
  sql.push(`insert into core.businesses (id, account_id, name)
    select ${q(S)}, account_id, 'Fixture Services' from core.account_members where user_id = ${q(servicesOwner)} on conflict do nothing;`);
  sql.push(`insert into core.business_members (business_id, user_id, role) values
    (${q(T)}, ${q(tradersOwner)}, 'owner'), (${q(T)}, ${q(tradersAccountant)}, 'accountant'), (${q(S)}, ${q(servicesOwner)}, 'owner')
    on conflict do nothing;`);
  sql.push(`insert into core.business_settings (business_id, gstin, state) values
    (${q(T)}, '27AABCF1234A1Z5', 'MH'), (${q(S)}, '29AABCS5678B1Z2', 'KA')
    on conflict (business_id) do update set gstin = excluded.gstin, state = excluded.state;`);
  sql.push(`insert into core.licenses (account_id, business_id, module_key, status)
    select b.account_id, b.id, m.key, 'active' from core.businesses b cross join (values ('gst'), ('inventory'), ('fsm')) m(key)
    where b.id = ${q(T)} on conflict do nothing;`);
  sql.push(`insert into core.licenses (account_id, business_id, module_key, status, deactivated_at, grace_ends_at)
    select b.account_id, b.id, m.key, m.status, m.deactivated, m.grace
    from core.businesses b cross join (values
      ('gst', 'active', null::timestamptz, null::timestamptz),
      ('inventory', 'grace', timestamptz '2026-09-20 00:00:00+00', timestamptz '2026-10-20 00:00:00+00')) m(key, status, deactivated, grace)
    where b.id = ${q(S)} on conflict do nothing;`);

  // --- Chart, periods, bank account ------------------------------------------------
  sql.push(...chartSql(T, chart), ...chartSql(S, chart));
  sql.push(...periodsSql(T, "2026-04"), ...periodsSql(S, null));
  const bank = fxId(`${T}:bank-account:hdfc`);
  sql.push(`insert into gst.bank_accounts (id, business_id, name, bank_name, account_number_last4, ledger_account_id, opening_balance, opening_balance_date)
    values (${q(bank)}, ${q(T)}, 'HDFC Current', 'HDFC Bank', '4321', ${q(acct(T, "1100"))}, 250000, '2026-04-01') on conflict do nothing;`);

  // --- Parties (customers and suppliers are one table, two roles) ------------------
  const customers = [
    ["Asha Retail", "27AAACA0001A1Z1", "MH"],
    ["Bharat Motors", "27AAACB0002B1Z2", "MH"],
    ["Coastal Foods", "27AAACC0003C1Z3", "MH"],
    ["Deccan Pharma", "27AAACD0004D1Z4", "MH"],
    ["Everest Hotels", "29AAACE0005E1Z5", "KA"], // inter-state: IGST
  ].map(([name, gstin, state], i) => ({ id: fxId(`${T}:customer:${i}`), name, gstin, state }));
  const suppliers = [
    ["Steelworks Supply", "27AAACS0006F1Z6", "MH"],
    ["Packright Materials", "27AAACP0007G1Z7", "MH"],
    ["CloudHost Services", null, null],
    ["Metro Landlords", null, null],
  ].map(([name, gstin, state], i) => ({ id: fxId(`${T}:supplier:${i}`), name, gstin, state }));
  for (const [list, role] of [[customers, "customer"], [suppliers, "supplier"]]) {
    for (const p of list) {
      sql.push(`insert into core.parties (id, business_id, name) values (${q(p.id)}, ${q(T)}, ${q(p.name)}) on conflict do nothing;`);
      sql.push(`insert into core.party_roles (business_id, party_id, role) values (${q(T)}, ${q(p.id)}, ${q(role)}) on conflict do nothing;`);
      if (p.gstin) {
        sql.push(`insert into core.tax_identities (party_id, business_id, gstin, state) values (${q(p.id)}, ${q(T)}, ${q(p.gstin)}, ${q(p.state)}) on conflict do nothing;`);
      }
    }
  }

  // --- Items: goods and services ----------------------------------------------------
  const goods = [
    ["Steel Rack", "RACK-01", 1800, 2500],
    ["Storage Bin", "BIN-02", 120, 200],
    ["Pallet Jack", "JACK-03", 9000, 12500],
    ["Shelf Label Pack", "LBL-04", 40, 75],
  ].map(([name, sku, cost, sell], i) => ({ id: fxId(`${T}:good:${i}`), name, sku, cost, sell }));
  const services = [
    ["Installation", "SVC-INST", 1500],
    ["Annual Maintenance", "SVC-AMC", 6000],
  ].map(([name, sku, sell], i) => ({ id: fxId(`${T}:service:${i}`), name, sku, sell }));
  for (const g of goods) {
    sql.push(`insert into core.items (id, business_id, kind, sku, name, hsn_code, tax_rate, cost_price, selling_price)
      values (${q(g.id)}, ${q(T)}, 'good', ${q(g.sku)}, ${q(g.name)}, '9403', 18, ${g.cost}, ${g.sell}) on conflict do nothing;`);
  }
  for (const s of services) {
    sql.push(`insert into core.items (id, business_id, kind, sku, name, hsn_code, tax_rate, cost_price, selling_price)
      values (${q(s.id)}, ${q(T)}, 'service', ${q(s.sku)}, ${q(s.name)}, '998719', 18, 0, ${s.sell}) on conflict do nothing;`);
  }

  // --- 30 invoices, Apr–Sep 2026 (the first five fall in the LOCKED April) -----------
  const invoices = [];
  for (let i = 1; i <= 30; i++) {
    const customer = customers[(i - 1) % customers.length];
    const good = goods[(i - 1) % goods.length];
    const lines = [{ item: good.id, qty: (i % 5) + 1, price: good.sell, rate: 18 }];
    if (i % 3 === 0) lines.push({ item: services[i % 2].id, qty: 1, price: services[i % 2].sell, rate: 18 });
    const date = addDays("2026-04-03", (i - 1) * 6);
    invoices.push({
      id: fxId(`${T}:invoice:${i}`),
      type: "invoice",
      module: i % 3 === 0 ? "fsm" : "inventory",
      party: customer.id,
      number: `INV-2026-${pad(i)}`,
      status: "issued",
      date,
      due: addDays(date, 30),
      interState: customer.state !== "MH",
      lines,
    });
  }
  for (const inv of invoices) sql.push(...documentSql(T, tradersOwner, inv));

  // Credit notes against invoices 2, 7, 12 (one of each module's source_ref key, so
  // Finance's two-key reading is exercised); debit notes on invoices 4 and 9.
  const creditNotes = [2, 7, 12].map((n, k) => {
    const inv = invoices[n - 1];
    const line = inv.lines[0];
    return {
      id: fxId(`${T}:credit-note:${k}`),
      type: "credit_note",
      module: inv.module,
      sourceRef: inv.module === "fsm" ? { invoice_id: inv.id } : { sales_invoice_id: inv.id },
      party: inv.party,
      number: `CN-2026-${pad(k + 1)}`,
      status: "issued",
      date: addDays(inv.date, 5),
      interState: inv.interState,
      lines: [{ item: line.item, qty: 1, price: line.price, rate: 18 }],
    };
  });
  const debitNotes = [4, 9].map((n, k) => {
    const inv = invoices[n - 1];
    return {
      id: fxId(`${T}:debit-note:${k}`),
      type: "debit_note",
      module: "inventory",
      sourceRef: { sales_invoice_id: inv.id },
      party: inv.party,
      number: `DN-2026-${pad(k + 1)}`,
      status: "issued",
      date: addDays(inv.date, 3),
      interState: inv.interState,
      lines: [{ item: goods[3].id, qty: 2, price: goods[3].sell, rate: 18 }],
    };
  });
  for (const d of [...creditNotes, ...debitNotes]) sql.push(...documentSql(T, tradersOwner, d));

  // --- 20 supplier bills and 20 expenses (one document type, told apart by kind) -----
  const bills = [];
  for (let j = 1; j <= 20; j++) {
    const supplier = suppliers[(j - 1) % 2];
    const subtotal = 5000 + j * 250;
    const tax = round2(subtotal * 0.18);
    // Bill 20 repeats bill 19's supplier-invoice number: the "same bill entered twice"
    // duplicate scenario (different internal numbers, same supplier reference).
    const supplierRef = j === 20 ? bills[18].sourceRef.supplier_invoice_number : `${supplier.name.slice(0, 3).toUpperCase()}-${1000 + j}`;
    bills.push({
      id: fxId(`${T}:bill:${j}`),
      type: "supplier_bill",
      module: "finance",
      sourceRef: { kind: "bill", value_account_id: acct(T, "1400"), gst_rate_percent: 18, supplier_invoice_number: supplierRef },
      party: j === 20 ? bills[18].party : supplier.id,
      number: `BILL-2026-${pad(j)}`,
      status: "posted",
      date: addDays("2026-04-05", (j - 1) * 8),
      due: addDays(addDays("2026-04-05", (j - 1) * 8), 30),
      header: { subtotal, cgst: round2(tax / 2), sgst: round2(tax - round2(tax / 2)), igst: 0 },
    });
  }
  const expenseAccounts = ["6200", "6300", "6400", "6500", "6600", "6700"];
  const expenses = [];
  for (let k = 1; k <= 20; k++) {
    const account = expenseAccounts[(k - 1) % expenseAccounts.length];
    const landlord = account === "6200";
    expenses.push({
      id: fxId(`${T}:expense:${k}`),
      type: "supplier_bill",
      module: "finance",
      sourceRef: { kind: "expense", value_account_id: acct(T, account), gst_rate_percent: landlord ? 0 : 18 },
      party: landlord ? suppliers[3].id : suppliers[2].id,
      number: `EXP-2026-${pad(k)}`,
      status: "posted",
      date: addDays("2026-04-02", (k - 1) * 8),
      header: landlord
        ? { subtotal: 40000, cgst: 0, sgst: 0, igst: 0 }
        : { subtotal: 1000 + k * 100, cgst: round2((1000 + k * 100) * 0.09), sgst: round2((1000 + k * 100) * 0.09), igst: 0 },
    });
  }
  for (const d of [...bills, ...expenses]) sql.push(...documentSql(T, tradersOwner, d));

  // Two purchase orders mirroring August's goods bills — the GST purchase register reads
  // purchase orders, so these are what the 2B "matched" rows reconcile against.
  const augustBills = bills.filter((b) => b.date.startsWith("2026-08"));
  augustBills.slice(0, 2).forEach((b, k) => {
    sql.push(
      ...documentSql(T, tradersOwner, {
        id: fxId(`${T}:purchase-order:${k}`),
        type: "purchase_order",
        module: "inventory",
        party: b.party,
        number: `PO-2026-${pad(k + 1)}`,
        status: "received",
        date: b.date,
        header: b.header,
      }),
    );
  });

  // --- 25 payments -----------------------------------------------------------------
  const payments = [];
  for (let r = 1; r <= 15; r++) {
    const inv = invoices[r + 4]; // invoices 6..20 — none in the locked April
    const total = invoiceTotal(inv);
    // r=3 is a part payment, r=5 an overpayment, the rest settle in full.
    const amount = r === 3 ? round2(total / 2) : r === 5 ? round2(total + 500) : total;
    payments.push({
      id: fxId(`${T}:receipt:${r}`),
      party: inv.party,
      method: r % 2 ? "bank" : "upi",
      amount,
      reference: `RCPT-${pad(r)}`,
      date: addDays(inv.date, 10),
      allocations: [{ document: inv.id, amount }],
    });
  }
  for (let p = 1; p <= 10; p++) {
    const bill = bills[p + 2]; // bills 4..13
    const total = round2(bill.header.subtotal + bill.header.cgst + bill.header.sgst);
    payments.push({
      id: fxId(`${T}:supplier-payment:${p}`),
      party: bill.party,
      method: "bank",
      amount: total,
      reference: `NEFT-OUT-${pad(p)}`,
      date: addDays(bill.date, 20),
      allocations: [{ document: bill.id, amount: total }],
    });
  }
  for (const p of payments) sql.push(...paymentSql(T, tradersOwner, p));

  // --- Bank statement lines, rules, recurring entries --------------------------------
  const receipt = (r) => payments[r - 1];
  const bankLines = [
    [receipt(1).date, `NEFT IN ${receipt(1).reference} ASHA`, receipt(1).amount, receipt(1).reference],
    [receipt(2).date, `UPI IN ${receipt(2).reference}`, receipt(2).amount, receipt(2).reference],
    [receipt(4).date, `NEFT IN ${receipt(4).reference}`, receipt(4).amount, receipt(4).reference],
    [payments[15].date, `NEFT OUT ${payments[15].reference}`, -payments[15].amount, payments[15].reference],
    ["2026-09-01", "POS AWS EMEA SARL", -4130, "AWS-0901"],
    ["2026-08-01", "POS AWS EMEA SARL", -3894, "AWS-0801"],
    ["2026-09-05", "NEFT OUT OFFICE RENT SEPT", -40000, "RENT-09"],
    ["2026-09-07", "BANK CHARGES Q2", -354, null],
    // Duplicate scenario: identical but for the reference — a re-import would carry the
    // same fingerprint and be refused; these are two genuine payments.
    ["2026-09-10", "UPI IN CASH SALE COUNTER", 1180, "UPI-7781"],
    ["2026-09-10", "UPI IN CASH SALE COUNTER", 1180, "UPI-7782"],
    ["2026-09-12", "INTEREST CREDIT", 212.5, null],
    ["2026-09-15", "UNKNOWN DEPOSIT", 5000, "CHQ-448812"],
  ];
  bankLines.forEach(([date, description, amount, reference], i) => {
    const fingerprint = [date, Math.round(amount * 100), description.toLowerCase(), (reference ?? "").toLowerCase()].join("|");
    sql.push(`insert into gst.bank_transactions (id, business_id, bank_account_id, txn_date, description, reference, amount, source, import_fingerprint)
      values (${q(fxId(`${T}:bank-line:${i}`))}, ${q(T)}, ${q(bank)}, ${q(date)}, ${q(description)}, ${q(reference)}, ${amount}, 'import', ${q(fingerprint)}) on conflict do nothing;`);
  });
  sql.push(`insert into gst.bank_rules (id, business_id, name, match_text, direction, account_id, party_id, priority) values
    (${q(fxId(`${T}:rule:aws`))}, ${q(T)}, 'Cloud hosting', 'AWS', 'out', ${q(acct(T, "6500"))}, ${q(suppliers[2].id)}, 10),
    (${q(fxId(`${T}:rule:rent`))}, ${q(T)}, 'Office rent', 'office rent', 'out', ${q(acct(T, "6200"))}, ${q(suppliers[3].id)}, 20)
    on conflict do nothing;`);
  sql.push(`insert into gst.recurring_entries (id, business_id, name, memo, frequency, anchor_date, template_lines) values
    (${q(fxId(`${T}:recurring:depreciation`))}, ${q(T)}, 'Depreciation', 'Monthly depreciation on racks and equipment', 'monthly', '2026-04-30',
      ${q(JSON.stringify([{ accountId: acct(T, "6800"), debit: 2500, credit: 0 }, { accountId: acct(T, "1500"), debit: 0, credit: 2500 }]))}::jsonb),
    (${q(fxId(`${T}:recurring:software`))}, ${q(T)}, 'Accounting software', null, 'monthly', '2026-04-15',
      ${q(JSON.stringify([{ accountId: acct(T, "6500"), debit: 999, credit: 0 }, { accountId: acct(T, "1100"), debit: 0, credit: 999 }]))}::jsonb)
    on conflict do nothing;`);

  // --- GSTR-2B for 2026-08: matched, mismatched, missing in books ----------------------
  const statement = fxId(`${T}:gstr2b:2026-08`);
  sql.push(`insert into gst.gstr2b_statements (id, business_id, return_period, gstin, generated_on, source, raw)
    values (${q(statement)}, ${q(T)}, '2026-08', '27AABCF1234A1Z5', '2026-09-14', 'manual_upload', '{"fixture": true}'::jsonb) on conflict do nothing;`);
  const gstinOf = new Map(suppliers.map((s) => [s.id, s.gstin]));
  const twoB = [
    // matched: exactly what the books hold
    ...augustBills.slice(0, 2).map((b) => ({ key: `match:${b.number}`, gstin: gstinOf.get(b.party), number: b.sourceRef.supplier_invoice_number, date: b.date, ...b.header })),
    // mismatched: the supplier reported a different value from the one booked
    ...augustBills.slice(2, 4).map((b) => ({ key: `mismatch:${b.number}`, gstin: gstinOf.get(b.party), number: b.sourceRef.supplier_invoice_number, date: b.date, subtotal: b.header.subtotal + 1000, cgst: b.header.cgst + 90, sgst: b.header.sgst + 90 })),
    // missing in books: filed by a supplier, never booked here
    { key: "missing:1", gstin: "27AAACZ0009Z1Z9", number: "ZNX-5501", date: "2026-08-21", subtotal: 12000, cgst: 1080, sgst: 1080 },
    { key: "missing:2", gstin: "27AAACZ0009Z1Z9", number: "ZNX-5502", date: "2026-08-28", subtotal: 3000, cgst: 270, sgst: 270 },
  ];
  twoB.forEach((d) => {
    sql.push(`insert into gst.gstr2b_documents (id, statement_id, business_id, section, document_type, supplier_gstin, supplier_trade_name, document_number, document_date,
        document_value, taxable_value, cgst_amount, sgst_amount, igst_amount)
      values (${q(fxId(`${T}:gstr2b-doc:${d.key}`))}, ${q(statement)}, ${q(T)}, 'b2b', 'invoice', ${q(d.gstin)}, null, ${q(d.number)}, ${q(d.date)},
        ${round2(d.subtotal + d.cgst + d.sgst)}, ${d.subtotal}, ${d.cgst}, ${d.sgst}, 0) on conflict do nothing;`);
  });

  // --- GST return, e-invoices, domain events -----------------------------------------
  sql.push(`insert into gst.return_periods (id, business_id, return_type, period_start, period_end, status, snapshot, status_history, filing_reference, filed_at)
    values (${q(fxId(`${T}:gstr1:2026-04`))}, ${q(T)}, 'gstr1', '2026-04-01', '2026-04-30', 'filed', '{"fixture": true}'::jsonb,
      '[{"status":"filed","at":"2026-05-11T10:00:00Z","by":null}]'::jsonb, 'AA270526000001F', '2026-05-11 10:00:00+00') on conflict do nothing;`);
  sql.push(`insert into gst.einvoices (id, business_id, document_id, status, irn, ack_no, ack_date)
    values (${q(fxId(`${T}:einvoice:1`))}, ${q(T)}, ${q(invoices[0].id)}, 'generated', 'fixture-irn-0001', '112610000000001', '2026-04-03 11:00:00+00') on conflict do nothing;`);
  const failed = invoices[29];
  sql.push(`insert into core.domain_events (id, business_id, type, required_module, payload, status, attempts, last_error, published_at)
    values (${q(fxId(`${T}:event:einvoice-failed`))}, ${q(T)}, 'document.issued', 'gst', ${q(JSON.stringify({ invoiceId: failed.id, docType: "invoice" }))}::jsonb,
      'failed', 5, 'GSP rejected the request: 2150 Duplicate IRN (fixture)', '2026-09-24 09:00:00+00') on conflict do nothing;`);
  // Duplicate delivery: the same invoice's issue event twice — posting is keyed on the
  // document, so both converge on one entry.
  for (const k of [1, 2]) {
    sql.push(`insert into core.domain_events (id, business_id, type, required_module, payload, status, published_at, processed_at)
      values (${q(fxId(`${T}:event:dup:${k}`))}, ${q(T)}, 'document.issued', 'gst', ${q(JSON.stringify({ invoiceId: invoices[20].id, docType: "invoice" }))}::jsonb,
        'processed', '2026-08-13 09:00:00+00', '2026-08-13 09:00:05+00') on conflict do nothing;`);
  }

  // --- Business two: Fixture Services (Finance only, Inventory in grace) --------------
  const sCustomer = fxId(`${S}:customer:0`);
  const sSupplier = fxId(`${S}:supplier:0`);
  const sService = fxId(`${S}:service:0`);
  sql.push(`insert into core.parties (id, business_id, name) values (${q(sCustomer)}, ${q(S)}, 'Horizon Offices'), (${q(sSupplier)}, ${q(S)}, 'Tools Depot') on conflict do nothing;`);
  sql.push(`insert into core.party_roles (business_id, party_id, role) values (${q(S)}, ${q(sCustomer)}, 'customer'), (${q(S)}, ${q(sSupplier)}, 'supplier') on conflict do nothing;`);
  sql.push(`insert into core.items (id, business_id, kind, sku, name, tax_rate, selling_price) values (${q(sService)}, ${q(S)}, 'service', 'CLEAN', 'Office cleaning', 18, 8000) on conflict do nothing;`);
  const sInvoices = [1, 2, 3, 4, 5].map((i) => ({
    id: fxId(`${S}:invoice:${i}`),
    type: "invoice",
    module: "fsm",
    party: sCustomer,
    number: `SRV-2026-${pad(i)}`,
    status: "issued",
    date: addDays("2026-05-01", (i - 1) * 30),
    lines: [{ item: sService, qty: 1, price: 8000, rate: 18 }],
  }));
  const sBills = [1, 2, 3].map((j) => ({
    id: fxId(`${S}:bill:${j}`),
    type: "supplier_bill",
    module: "finance",
    sourceRef: { kind: "bill", value_account_id: acct(S, "5300"), gst_rate_percent: 18 },
    party: sSupplier,
    number: `SB-2026-${pad(j)}`,
    status: "posted",
    date: addDays("2026-05-10", (j - 1) * 40),
    header: { subtotal: 2000, cgst: 180, sgst: 180, igst: 0 },
  }));
  for (const d of [...sInvoices, ...sBills]) sql.push(...documentSql(S, servicesOwner, d));
  sql.push(
    ...paymentSql(S, servicesOwner, { id: fxId(`${S}:receipt:1`), party: sCustomer, method: "bank", amount: 9440, reference: "SRV-RCPT-1", date: "2026-05-20", allocations: [{ document: sInvoices[0].id, amount: 9440 }] }),
    ...paymentSql(S, servicesOwner, { id: fxId(`${S}:supplier-payment:1`), party: sSupplier, method: "bank", amount: 2360, reference: "SRV-OUT-1", date: "2026-05-25", allocations: [{ document: sBills[0].id, amount: 2360 }] }),
  );

  return `-- FIN-10 deterministic Finance fixture set. Generated by scripts/lib/finance-fixtures.mjs;
-- local test databases only (see scripts/seed-finance-fixtures.mjs).
begin;
${sql.join("\n")}
commit;
`;
}
