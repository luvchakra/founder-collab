#!/usr/bin/env node
/**
 * Tenant-isolation + license-gating test for the `fsm` schema (Epic 5, story F-1;
 * FSM PRD §7 acceptance criterion 7/8; CLAUDE.md principle 9), via the shared harness
 * (C-8). Mirrors test-inventory-rls.mjs's own structure -- the first real exercise of
 * the `tenant AND licensed` pattern for a schema built fresh rather than ported.
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
    dbNamePrefix: "fsm_rls_test",
    migrationsDir: MIGRATIONS_DIR,
    stubFile: STUB_FILE,
    testFn: async ({ psql, psqlAs, assertEqual, assertThrows }) => {
      const psqlAsAlice = (sql) => psqlAs(ALICE, sql);
      const psqlAsBob = (sql) => psqlAs(BOB, sql);

      console.log("Seeding two businesses, no fsm license yet...");
      psql(`
        insert into auth.users (id, email) values
          ('${ALICE}', 'alice@example.com'),
          ('${BOB}', 'bob@example.com');
        grant usage on schema core to authenticated;
        grant select, insert, update, delete on all tables in schema core to authenticated;
        grant usage on schema fsm to authenticated;
        grant select, insert, update, delete on all tables in schema fsm to authenticated;
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
      const aliceParty = psqlAsAlice(`insert into core.parties (business_id, name) values ('${aliceBusiness}', 'Alice Customer') returning id;`);
      const bobParty = psqlAsBob(`insert into core.parties (business_id, name) values ('${bobBusiness}', 'Bob Customer') returning id;`);

      console.log("Verifying no license at all denies both read and write...");
      assertEqual(psqlAsAlice(`select count(*) from fsm.opportunities`), "0", "with no license, Alice sees zero opportunities even before any exist (sanity)");
      assertThrows(
        () => psqlAsAlice(`insert into fsm.opportunities (business_id, party_id) values ('${aliceBusiness}', '${aliceParty}')`),
        "with no fsm license at all, Alice cannot create an opportunity",
      );

      console.log("Activating a grace-period license and re-checking...");
      psql(`
        insert into core.licenses (account_id, business_id, module_key, status, grace_ends_at)
        select account_id, id, 'fsm', 'grace', now() + interval '10 days' from core.businesses where id = '${aliceBusiness}';
      `);
      assertThrows(
        () => psqlAsAlice(`insert into fsm.opportunities (business_id, party_id) values ('${aliceBusiness}', '${aliceParty}')`),
        "a grace-period license still denies writes",
      );

      console.log("Activating the license and creating real fsm data...");
      psql(`update core.licenses set status = 'active' where business_id = '${aliceBusiness}' and module_key = 'fsm';`);
      psql(`
        insert into core.licenses (account_id, business_id, module_key, status)
        select account_id, id, 'fsm', 'active' from core.businesses where id = '${bobBusiness}';
      `);

      const aliceServiceType = psqlAsAlice(`insert into fsm.service_types (business_id, name) values ('${aliceBusiness}', 'HVAC Repair') returning id;`);
      const aliceOpp = psqlAsAlice(`
        insert into fsm.opportunities (business_id, party_id, service_type_id, description, scope_of_work)
        values ('${aliceBusiness}', '${aliceParty}', '${aliceServiceType}', 'internal note', 'customer-facing scope')
        returning id;
      `);
      assertEqual(psqlAsAlice(`select status from fsm.opportunities where id = '${aliceOpp}'`), "new", "a new opportunity defaults to status 'new'");

      console.log("Verifying the 'lost requires a reason' check constraint...");
      assertThrows(
        () => psqlAsAlice(`update fsm.opportunities set status = 'lost' where id = '${aliceOpp}'`),
        "marking an opportunity lost with no lost_reason violates the check constraint",
      );
      psqlAsAlice(`update fsm.opportunities set status = 'lost', lost_reason = 'went with a competitor' where id = '${aliceOpp}'`);
      psqlAsAlice(`update fsm.opportunities set status = 'new', lost_reason = null where id = '${aliceOpp}'`);

      const aliceJob = psqlAsAlice(`
        insert into fsm.jobs (business_id, opportunity_id, party_id, service_type_id, description)
        values ('${aliceBusiness}', '${aliceOpp}', '${aliceParty}', '${aliceServiceType}', 'Fix the AC unit')
        returning id;
      `);
      psqlAsAlice(`update fsm.opportunities set status = 'won', converted_job_id = '${aliceJob}' where id = '${aliceOpp}'`);

      const aliceEmployee = psqlAsAlice(`insert into core.employees (business_id, user_id) values ('${aliceBusiness}', '${ALICE}') returning id;`);
      const aliceEvent = psqlAsAlice(`
        insert into fsm.events (business_id, kind, job_id, starts_at)
        values ('${aliceBusiness}', 'work', '${aliceJob}', now() + interval '1 day')
        returning id;
      `);
      psqlAsAlice(`insert into fsm.event_assignees (business_id, event_id, employee_id) values ('${aliceBusiness}', '${aliceEvent}', '${aliceEmployee}');`);

      console.log("Verifying the events check constraint (job_id or opportunity_id required)...");
      assertThrows(
        () => psqlAsAlice(`insert into fsm.events (business_id, kind, starts_at) values ('${aliceBusiness}', 'reminder', now())`),
        "an event with neither job_id nor opportunity_id violates the check constraint",
      );

      console.log("Verifying time_entries: clock in, one-open-per-employee, clock out...");
      const aliceEntry = psqlAsAlice(`insert into fsm.time_entries (business_id, job_id, employee_id) values ('${aliceBusiness}', '${aliceJob}', '${aliceEmployee}') returning id;`);
      assertThrows(
        () => psqlAsAlice(`insert into fsm.time_entries (business_id, job_id, employee_id) values ('${aliceBusiness}', '${aliceJob}', '${aliceEmployee}')`),
        "an employee cannot have two open (not-yet-clocked-out) time entries at once",
      );
      psqlAsAlice(`update fsm.time_entries set ended_at = started_at + interval '2 hours' where id = '${aliceEntry}'`);
      assertEqual(psqlAsAlice(`select duration_minutes from fsm.time_entries where id = '${aliceEntry}'`), "120.00", "duration_minutes is computed from started_at/ended_at");
      // Now that the entry is closed, a second one is allowed.
      psqlAsAlice(`insert into fsm.time_entries (business_id, job_id, employee_id) values ('${aliceBusiness}', '${aliceJob}', '${aliceEmployee}');`);

      console.log("Verifying notes, signatures, expenses round-trip...");
      psqlAsAlice(`insert into fsm.notes (business_id, job_id, body, visibility) values ('${aliceBusiness}', '${aliceJob}', 'Customer was happy', 'internal');`);
      psqlAsAlice(`insert into fsm.signatures (business_id, job_id, signer_name) values ('${aliceBusiness}', '${aliceJob}', 'Alice Customer');`);
      psqlAsAlice(`insert into fsm.expenses (business_id, job_id, description, amount) values ('${aliceBusiness}', '${aliceJob}', 'Parking', 5.50);`);

      console.log("Verifying tenant isolation between two licensed businesses...");
      const bobServiceType = psqlAsBob(`insert into fsm.service_types (business_id, name) values ('${bobBusiness}', 'Plumbing') returning id;`);
      const bobJob = psqlAsBob(`insert into fsm.jobs (business_id, party_id, service_type_id, description) values ('${bobBusiness}', '${bobParty}', '${bobServiceType}', 'Fix a leak') returning id;`);
      assertEqual(psqlAsBob("select count(*) from fsm.jobs"), "1", "Bob sees only his own job");
      assertEqual(psqlAsAlice("select count(*) from fsm.jobs"), "1", "Alice still sees only her own job");
      assertEqual(psqlAsBob("select count(*) from fsm.opportunities"), "0", "Bob sees none of Alice's opportunities");

      console.log("Verifying cross-tenant reference-smuggling triggers...");
      assertThrows(
        () => psqlAsBob(`insert into fsm.opportunities (business_id, party_id) values ('${bobBusiness}', '${aliceParty}')`),
        "Bob cannot create an opportunity against Alice's party",
      );
      assertThrows(
        () => psqlAsBob(`insert into fsm.jobs (business_id, party_id, service_type_id) values ('${bobBusiness}', '${bobParty}', '${aliceServiceType}')`),
        "Bob cannot create a job using Alice's service_type_id",
      );
      assertThrows(
        () => psqlAsBob(`insert into fsm.time_entries (business_id, job_id, employee_id) values ('${bobBusiness}', '${aliceJob}', '${aliceEmployee}')`),
        "Bob cannot log a time entry against Alice's job",
      );
      const bobEvent = psqlAsBob(`insert into fsm.events (business_id, kind, job_id, starts_at) values ('${bobBusiness}', 'work', '${bobJob}', now()) returning id;`);
      assertThrows(
        () => psqlAsBob(`insert into fsm.event_assignees (business_id, event_id, employee_id) values ('${bobBusiness}', '${bobEvent}', '${aliceEmployee}')`),
        "Bob cannot assign Alice's employee to his own event",
      );
      assertThrows(
        () => psqlAsAlice(`insert into fsm.event_assignees (business_id, event_id, employee_id) values ('${aliceBusiness}', '${bobEvent}', '${aliceEmployee}')`),
        "Alice cannot attach her own employee to Bob's event",
      );

      console.log("Verifying fsm.settings (business_id-keyed, one row per business)...");
      psqlAsAlice(`insert into fsm.settings (business_id, reminder_lead_hours) values ('${aliceBusiness}', 24);`);
      assertEqual(psqlAsBob(`select count(*) from fsm.settings`), "0", "Bob cannot see Alice's fsm settings row");
      assertThrows(
        () => psqlAsBob(`insert into fsm.settings (business_id) values ('${aliceBusiness}')`),
        "Bob cannot create a settings row for Alice's business (write_licensed_business_ids excludes it)",
      );

      console.log("\nAll fsm schema RLS checks passed.");
    },
  });
}

main();
