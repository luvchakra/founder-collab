#!/usr/bin/env node
/**
 * COMPLY-P0-03.5 "No Duplicate Masters" — a forward-looking guard, not a fix for any
 * violation found today. The reconnaissance for this story (see
 * docs/design/compliance-backlog-audit.md's own 03.5 entry) confirmed every `gst`-schema
 * table that exists as of this story (eway_bill_credentials, einvoice_credentials,
 * einvoices, eway_bills, compliance_profiles, tax_registrations, tax_rules,
 * tax_determinations) is genuinely Compliance-owned content — credentials, government
 * generation history keyed by `document_id` into `core.documents`, or the generic tax
 * framework's own new concepts — never a second copy of a customer, product, party,
 * document/invoice, payment or address master. Those masters are owned exclusively by
 * `core` per docs/plan/00-MASTER-PLAN.md §5 ("the entity-ownership map — the
 * anti-duplication contract") and CLAUDE.md non-negotiable #5.
 *
 * `lint-migration-schema.mjs` already stops a migration from touching two *module*
 * schemas in one file, but says nothing about a module schema re-creating a *core-owned
 * concept* under its own roof (e.g. a hypothetical `gst.customers` table, which would be
 * perfectly schema-isolated and would sail through that check while still being exactly
 * the duplication CLAUDE.md non-negotiable #5 and this backlog's own rule 3 forbid). This
 * script closes that specific gap for the `gst` schema — the one this run is scoped to —
 * so a later India-GST or e-invoicing story (COMPLY-P0-04 onward) that's tempted to stash
 * a denormalized customer/product/invoice copy for filing convenience fails CI instead of
 * landing quietly.
 *
 * Deliberately scoped to `gst` only, not every module schema: this run has no mandate to
 * police `discovery`/`inventory`/`fsm`/`crm`'s own migrations (and `discovery.products`
 * already legitimately uses a reserved-sounding name for an unrelated, pre-existing,
 * already-decided concept — a per-workspace GTM offering, not `core.items`' sellable SKU
 * master — so a platform-wide version of this rule would need that module's own review,
 * not this one's). A later backlog for another module can add its own equivalent guard
 * following this same pattern.
 *
 * `runLint(root)` is exported so lint-gst-no-duplicate-masters.test.mjs can prove the rule
 * actually bites against a fixture tree, matching lint-import-boundaries.mjs's own
 * "deliberately-failing fixture test" convention.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";

const DEFAULT_ROOT = new URL("..", import.meta.url).pathname;

// Exact, unqualified table names whose canonical home is `core` per
// docs/plan/00-MASTER-PLAN.md §5. Matched case-insensitively against every
// `create table gst.<name>` in the migration timeline. Deliberately an exact-match set,
// not a substring/regex heuristic — a real Compliance concept must never be forced into
// an awkward name just to dodge a fuzzy pattern (e.g. `tax_registrations` legitimately
// contains "registrations" but is not a "registration" duplication of anything core owns).
const RESERVED_CORE_MASTER_TABLE_NAMES = new Set([
  // Party (customer | supplier | prospect | vendor | lead — one row, many roles)
  "party",
  "parties",
  "party_roles",
  "party_contacts",
  "customer",
  "customers",
  "supplier",
  "suppliers",
  // Item (good | service | labour | part — the sellable/stockable master)
  "item",
  "items",
  "item_categories",
  "item_inventory_attrs",
  "product",
  "products",
  // Document (estimate | sales order | invoice | credit/debit note | proforma | PO)
  "document",
  "documents",
  "document_lines",
  "invoice",
  "invoices",
  "sales_order",
  "sales_orders",
  "sales_invoice",
  "sales_invoices",
  "credit_note",
  "credit_notes",
  "debit_note",
  "debit_notes",
  "purchase_order",
  "purchase_orders",
  "transaction",
  "transactions",
  // Payment
  "payment",
  "payments",
  "payment_allocations",
  // Address / tax identity (read by gst for place-of-supply, owned by core)
  "address",
  "addresses",
  "tax_identity",
  "tax_identities",
]);

const CREATE_GST_TABLE_RE =
  /\bcreate\s+table\s+(?:if\s+not\s+exists\s+)?"?gst"?\s*\.\s*"?([a-z_][a-z0-9_]*)"?/gi;

export function runLint(root = DEFAULT_ROOT) {
  const migrationsDir = join(root, "supabase", "migrations");
  const violations = [];
  let scanned = 0;

  let files;
  try {
    files = readdirSync(migrationsDir).filter((f) => f.endsWith(".sql"));
  } catch {
    return { violations, scanned };
  }

  for (const file of files) {
    const full = join(migrationsDir, file);
    const source = readFileSync(full, "utf8");
    scanned += 1;
    for (const m of source.matchAll(CREATE_GST_TABLE_RE)) {
      const tableName = m[1].toLowerCase();
      if (RESERVED_CORE_MASTER_TABLE_NAMES.has(tableName)) {
        violations.push(
          `${relative(root, full)}: creates "gst.${tableName}" — this name is a core-owned master concept ` +
            `(docs/plan/00-MASTER-PLAN.md §5). Compliance must read it from \`core\` directly, never re-create ` +
            `it under the \`gst\` schema (CLAUDE.md non-negotiable #5, backlog rule "no duplicate masters").`,
        );
      }
    }
  }

  return { violations, scanned };
}

function main() {
  const { violations, scanned } = runLint(DEFAULT_ROOT);

  if (violations.length > 0) {
    console.error(`No-duplicate-masters violations (${violations.length}):\n`);
    for (const v of violations) console.error(`  - ${v}`);
    console.error("");
    process.exit(1);
  }

  console.log(`lint:gst-no-duplicate-masters — ${scanned} migration file(s) scanned, no violations.`);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
