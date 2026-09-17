#!/usr/bin/env node
/**
 * End-to-end database test for ADR-9 / CLAUDE.md non-negotiable #4:
 *
 *   "Cancelling a license never deletes data: 30-day read-only grace, then access denied
 *    but rows retained; reactivation restores everything and replays parked events."
 *
 * The TypeScript state machine that drives these transitions is unit-tested
 * (packages/core/src/licensing/lifecycle.test.ts), but that test mocks the database, so
 * it can only prove we *write* 'grace'. What it cannot prove is the half that actually
 * protects a customer's data: that `grace` really does keep reads working while blocking
 * writes, that `expired` denies access without deleting a single row, and that flipping
 * back to `active` makes every one of those rows visible again. That is a property of
 * core.has_module()/has_module_write() and the `tenant AND licensed` policies on top of
 * them (C-3), so it can only be tested here, against the real migration timeline.
 *
 * `inventory` is used as the concrete licensed module because it is the one with real
 * module-owned tables today; nothing here is inventory-specific beyond that choice.
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
    dbNamePrefix: "core_license_lifecycle_test",
    migrationsDir: MIGRATIONS_DIR,
    stubFile: STUB_FILE,
    testFn: async ({ psql, psqlAs, assertEqual, assertThrows }) => {
      const asAlice = (sql) => psqlAs(ALICE, sql);
      const asBob = (sql) => psqlAs(BOB, sql);

      console.log("Seeding two accounts, each with one business...");
      psql(`
        insert into auth.users (id, email) values
          ('${ALICE}', 'alice@example.com'),
          ('${BOB}', 'bob@example.com');
        grant usage on schema core to authenticated;
        grant select, insert, update, delete on all tables in schema core to authenticated;
        grant usage on schema inventory to authenticated;
        grant select, insert, update, delete on all tables in schema inventory to authenticated;
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

      /** Replaces Alice's inventory license with one in `status`. */
      const setLicense = (status, graceEndsAt = "null") => {
        psql(`delete from core.licenses where business_id = '${aliceBusiness}' and module_key = 'inventory';`);
        psql(`
          insert into core.licenses (account_id, business_id, module_key, status, grace_ends_at)
          select account_id, id, 'inventory', '${status}', ${graceEndsAt}
          from core.businesses where id = '${aliceBusiness}';
        `);
      };
      const hasRead = () => psql(`select core.has_module('${aliceBusiness}', 'inventory');`);
      const hasWrite = () => psql(`select core.has_module_write('${aliceBusiness}', 'inventory');`);
      /** Row count as a superuser — i.e. what is physically still on disk, RLS aside. */
      const rowsOnDisk = () =>
        psql(`select count(*) from inventory.warehouses where business_id = '${aliceBusiness}';`);

      console.log("Verifying an active license grants both read and write...");
      setLicense("active");
      assertEqual(hasRead(), "t", "active: has_module() is true");
      assertEqual(hasWrite(), "t", "active: has_module_write() is true");
      const warehouse = asAlice(`
        insert into inventory.warehouses (business_id, name, code)
        values ('${aliceBusiness}', 'Main', 'MAIN') returning id;
      `);
      assertEqual(asAlice(`select count(*) from inventory.warehouses;`), "1", "active: Alice reads her warehouse");

      console.log("Verifying the 30-day grace window is read-only, not read-write...");
      setLicense("grace", "now() + interval '30 days'");
      assertEqual(hasRead(), "t", "grace: has_module() stays true — reads continue");
      assertEqual(hasWrite(), "f", "grace: has_module_write() is false — writes stop");
      assertEqual(asAlice(`select count(*) from inventory.warehouses;`), "1", "grace: existing data is still readable");
      assertThrows(
        () =>
          asAlice(`
            insert into inventory.warehouses (business_id, name, code)
            values ('${aliceBusiness}', 'Second', 'SEC');
          `),
        "grace: a new write is rejected by RLS",
      );
      // An UPDATE/DELETE during grace is a *silent no-op*, not an error: the write
      // policies gate on core.write_licensed_business_ids(), so a grace-period row simply
      // isn't visible to those statements and zero rows match. The data is equally safe
      // either way, but the difference is worth pinning -- a caller that doesn't check the
      // affected row count will believe its update succeeded.
      assertEqual(
        asAlice(`update inventory.warehouses set name = 'Renamed' where id = '${warehouse}' returning id;`),
        "",
        "grace: an update of existing data matches zero rows",
      );
      assertEqual(
        asAlice(`delete from inventory.warehouses where id = '${warehouse}' returning id;`),
        "",
        "grace: a delete of existing data matches zero rows",
      );
      assertEqual(
        asAlice(`select name from inventory.warehouses where id = '${warehouse}';`),
        "Main",
        "grace: the row is untouched by either attempt",
      );

      console.log("Verifying a grace window whose end has passed already denies reads...");
      setLicense("grace", "now() - interval '1 day'");
      assertEqual(hasRead(), "f", "elapsed grace: has_module() is false before any cron flips the row");
      assertEqual(hasWrite(), "f", "elapsed grace: has_module_write() is false");
      assertEqual(rowsOnDisk(), "1", "elapsed grace: the row is still on disk");

      console.log("Verifying an open-ended grace period (no end date) still reads...");
      setLicense("grace", "null");
      assertEqual(hasRead(), "t", "grace with no grace_ends_at: has_module() is true");
      assertEqual(hasWrite(), "f", "grace with no grace_ends_at: has_module_write() is still false");

      console.log("Verifying 'expired' denies access but retains every row (ADR-9)...");
      setLicense("expired");
      assertEqual(hasRead(), "f", "expired: has_module() is false");
      assertEqual(hasWrite(), "f", "expired: has_module_write() is false");
      assertEqual(asAlice(`select count(*) from inventory.warehouses;`), "0", "expired: Alice can no longer see her data");
      assertEqual(rowsOnDisk(), "1", "expired: the data was NOT deleted — it is invisible, not gone");

      console.log("Verifying 'cancelled' behaves the same way — denied, never deleted...");
      setLicense("cancelled");
      assertEqual(hasRead(), "f", "cancelled: has_module() is false");
      assertEqual(hasWrite(), "f", "cancelled: has_module_write() is false");
      assertEqual(rowsOnDisk(), "1", "cancelled: the data is still retained");

      console.log("Verifying reactivation restores everything (ADR-9's 'no too-late state')...");
      setLicense("active");
      assertEqual(hasRead(), "t", "reactivated: has_module() is true again");
      assertEqual(hasWrite(), "t", "reactivated: has_module_write() is true again");
      assertEqual(
        asAlice(`select name from inventory.warehouses where id = '${warehouse}';`),
        "Main",
        "reactivated: the original row is visible again, unchanged",
      );
      asAlice(`
        insert into inventory.warehouses (business_id, name, code)
        values ('${aliceBusiness}', 'Second', 'SEC');
      `);
      assertEqual(asAlice(`select count(*) from inventory.warehouses;`), "2", "reactivated: writes work again");

      console.log("Verifying a license is scoped to one business and one module...");
      assertEqual(
        psql(`select core.has_module('${bobBusiness}', 'inventory');`),
        "f",
        "Alice's inventory license does not license Bob's business",
      );
      assertEqual(
        psql(`select core.has_module('${aliceBusiness}', 'fsm');`),
        "f",
        "an inventory license does not grant fsm",
      );
      assertEqual(
        psql(`select core.has_module('${aliceBusiness}', 'no-such-module');`),
        "f",
        "an unknown module key is denied, not defaulted to allowed",
      );

      console.log("Verifying RLS on the licensing tables themselves...");
      assertEqual(asAlice(`select count(*) from core.licenses;`), "1", "Alice sees her own license row");
      assertEqual(asBob(`select count(*) from core.licenses;`), "0", "Bob cannot see Alice's license row");
      assertEqual(
        asBob(`select count(*) from core.modules;`),
        "5",
        "the module catalogue is readable by any authenticated user (the UI needs it to show locked modules)",
      );

      console.log("Verifying clients can never write licences directly (only the service role may)...");
      assertThrows(
        () =>
          asAlice(`
            insert into core.licenses (account_id, business_id, module_key, status)
            select account_id, id, 'fsm', 'active' from core.businesses where id = '${aliceBusiness}';
          `),
        "a member cannot grant themselves a license",
      );
      assertEqual(
        asAlice(`update core.licenses set status = 'active' where business_id = '${aliceBusiness}' returning id;`),
        "",
        "a member's update of a license row affects nothing",
      );
      assertEqual(
        asAlice(`delete from core.licenses where business_id = '${aliceBusiness}' returning id;`),
        "",
        "a member's delete of a license row affects nothing",
      );

      console.log("Verifying license_events are visible to the owning business only...");
      psql(`
        insert into core.license_events (license_id, business_id, module_key, event_type)
        select id, business_id, module_key, 'activated' from core.licenses
        where business_id = '${aliceBusiness}' and module_key = 'inventory';
      `);
      assertEqual(asAlice(`select count(*) from core.license_events;`), "1", "Alice sees her own license event");
      assertEqual(asBob(`select count(*) from core.license_events;`), "0", "Bob sees none of Alice's license events");

      console.log("\nAll core license lifecycle (ADR-9) checks passed.");
    },
  });
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
