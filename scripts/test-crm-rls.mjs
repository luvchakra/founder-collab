#!/usr/bin/env node
/**
 * Tenant-isolation + license-gating test for the `crm` schema (Epic 6, story S-1;
 * CLAUDE.md principle 9), via the shared harness (C-8). Mirrors test-fsm-rls.mjs's own
 * structure -- the same "tenant AND licensed" pattern, exercised fresh for a schema
 * that (unlike fsm) has no fine-grained permissions on top yet (deliberate skeleton
 * scope, per this migration's own docstring).
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
    dbNamePrefix: "crm_rls_test",
    migrationsDir: MIGRATIONS_DIR,
    stubFile: STUB_FILE,
    testFn: async ({ psql, psqlAs, assertEqual, assertThrows }) => {
      const psqlAsAlice = (sql) => psqlAs(ALICE, sql);
      const psqlAsBob = (sql) => psqlAs(BOB, sql);

      console.log("Seeding two businesses, no crm license yet...");
      psql(`
        insert into auth.users (id, email) values
          ('${ALICE}', 'alice@example.com'),
          ('${BOB}', 'bob@example.com');
        grant usage on schema core to authenticated;
        grant select, insert, update, delete on all tables in schema core to authenticated;
        grant usage on schema crm to authenticated;
        grant select, insert, update, delete on all tables in schema crm to authenticated;
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

      console.log("Verifying no license at all denies both read and write...");
      assertEqual(psqlAsAlice("select count(*) from crm.channels"), "0", "with no license, Alice sees zero channels even before any exist (sanity)");
      assertThrows(
        () => psqlAsAlice(`insert into crm.channels (business_id, kind, name) values ('${aliceBusiness}', 'email', 'Support')`),
        "with no crm license at all, Alice cannot create a channel",
      );

      console.log("Activating a grace-period license and re-checking (write needs active, not grace)...");
      psql(`
        insert into core.licenses (account_id, business_id, module_key, status, grace_ends_at)
        select account_id, id, 'crm', 'grace', now() + interval '10 days' from core.businesses where id = '${aliceBusiness}';
      `);
      assertThrows(
        () => psqlAsAlice(`insert into crm.channels (business_id, kind, name) values ('${aliceBusiness}', 'email', 'Support')`),
        "a grace-period crm license still denies writes",
      );

      console.log("Activating the license and creating real crm data...");
      psql(`update core.licenses set status = 'active' where business_id = '${aliceBusiness}' and module_key = 'crm';`);
      psql(`
        insert into core.licenses (account_id, business_id, module_key, status)
        select account_id, id, 'crm', 'active' from core.businesses where id = '${bobBusiness}';
      `);

      const aliceChannel = psqlAsAlice(`insert into crm.channels (business_id, kind, name) values ('${aliceBusiness}', 'whatsapp', 'WA Support') returning id;`);
      const aliceEmployee = psqlAsAlice(`insert into core.employees (business_id, user_id) values ('${aliceBusiness}', '${ALICE}') returning id;`);
      const aliceTicket = psqlAsAlice(`
        insert into crm.tickets (business_id, channel_id, party_id, subject)
        values ('${aliceBusiness}', '${aliceChannel}', '${aliceParty}', 'Where is my order?')
        returning id;
      `);
      assertEqual(psqlAsAlice(`select status from crm.tickets where id = '${aliceTicket}'`), "open", "a new ticket defaults to status 'open'");

      psqlAsAlice(`update crm.tickets set assigned_to = '${aliceEmployee}' where id = '${aliceTicket}'`);
      assertEqual(psqlAsAlice(`select assigned_to from crm.tickets where id = '${aliceTicket}'`), aliceEmployee, "a ticket can be assigned to an employee");

      const aliceRule = psqlAsAlice(`
        insert into crm.routing_rules (business_id, name, channel_id, assign_to_employee_id, priority)
        values ('${aliceBusiness}', 'WA to Alice', '${aliceChannel}', '${aliceEmployee}', 1)
        returning id;
      `);
      assertEqual(psqlAsAlice(`select is_active from crm.routing_rules where id = '${aliceRule}'`), "t", "a new routing rule defaults to active");

      console.log("Cancelling back into grace (ADR-9: 30-day read-only grace, not a hard cutoff) and verifying reads survive while writes don't...");
      psql(`update core.licenses set status = 'grace', grace_ends_at = now() + interval '10 days' where business_id = '${aliceBusiness}' and module_key = 'crm';`);
      assertEqual(psqlAsAlice(`select count(*) from crm.channels where id = '${aliceChannel}'`), "1", "grace-period Alice can still read her channel (ADR-9 -- data retained, not hidden)");
      assertEqual(psqlAsAlice(`select count(*) from crm.tickets where id = '${aliceTicket}'`), "1", "grace-period Alice can still read her ticket");
      assertEqual(psqlAsAlice(`select count(*) from crm.routing_rules where id = '${aliceRule}'`), "1", "grace-period Alice can still read her routing rule");
      assertEqual(
        psqlAsAlice(`update crm.tickets set status = 'pending' where id = '${aliceTicket}' returning id`),
        "",
        "grace-period Alice cannot update her own ticket -- RLS's USING clause filters it out silently (0 rows affected), not an error, since write needs an active license, not just grace",
      );
      assertEqual(psqlAsAlice(`select status from crm.tickets where id = '${aliceTicket}'`), "open", "the ticket's status is unchanged after the silently-filtered update attempt");
      assertThrows(
        () => psqlAsAlice(`insert into crm.channels (business_id, kind, name) values ('${aliceBusiness}', 'sms', 'SMS Support')`),
        "grace-period Alice cannot create a new channel either",
      );
      console.log("Reactivating Alice's license for the rest of the run...");
      psql(`update core.licenses set status = 'active', grace_ends_at = null where business_id = '${aliceBusiness}' and module_key = 'crm';`);

      console.log("Verifying deleting a channel cascades correctly (channel -> ticket sets null, channel -> routing_rule cascades)...");
      const scratchChannel = psqlAsAlice(`insert into crm.channels (business_id, kind, name) values ('${aliceBusiness}', 'social', 'Scratch') returning id;`);
      const scratchTicket = psqlAsAlice(`insert into crm.tickets (business_id, channel_id, subject) values ('${aliceBusiness}', '${scratchChannel}', 'Scratch ticket') returning id;`);
      const scratchRule = psqlAsAlice(`insert into crm.routing_rules (business_id, name, channel_id) values ('${aliceBusiness}', 'Scratch rule', '${scratchChannel}') returning id;`);
      psqlAsAlice(`delete from crm.channels where id = '${scratchChannel}'`);
      assertEqual(psqlAsAlice(`select channel_id from crm.tickets where id = '${scratchTicket}'`), "", "deleting a channel sets its tickets' channel_id to null rather than deleting the ticket (on delete set null)");
      assertEqual(psqlAsAlice(`select count(*) from crm.routing_rules where id = '${scratchRule}'`), "0", "deleting a channel cascades to delete any routing rule scoped to it (on delete cascade)");
      psqlAsAlice(`delete from crm.tickets where id = '${scratchTicket}'`);

      console.log("Verifying tenant isolation between two licensed businesses...");
      const bobChannel = psqlAsBob(`insert into crm.channels (business_id, kind, name) values ('${bobBusiness}', 'email', 'Bob Support') returning id;`);
      psqlAsBob(`insert into crm.tickets (business_id, channel_id, subject) values ('${bobBusiness}', '${bobChannel}', 'Bob ticket');`);
      assertEqual(psqlAsBob("select count(*) from crm.tickets"), "1", "Bob sees only his own ticket");
      assertEqual(psqlAsAlice("select count(*) from crm.tickets"), "1", "Alice still sees only her own ticket");
      assertEqual(psqlAsBob("select count(*) from crm.channels"), "1", "Bob sees none of Alice's channels");

      console.log("Verifying cross-tenant reference-smuggling triggers...");
      assertThrows(
        () => psqlAsBob(`insert into crm.tickets (business_id, channel_id) values ('${bobBusiness}', '${aliceChannel}')`),
        "Bob cannot create a ticket against Alice's channel",
      );
      assertThrows(
        () => psqlAsBob(`insert into crm.tickets (business_id, party_id) values ('${bobBusiness}', '${aliceParty}')`),
        "Bob cannot create a ticket against Alice's party",
      );
      assertThrows(
        () => psqlAsBob(`insert into crm.tickets (business_id, assigned_to) values ('${bobBusiness}', '${aliceEmployee}')`),
        "Bob cannot assign a ticket to Alice's employee",
      );
      assertThrows(
        () => psqlAsBob(`insert into crm.routing_rules (business_id, name, channel_id) values ('${bobBusiness}', 'Sneaky', '${aliceChannel}')`),
        "Bob cannot create a routing rule against Alice's channel",
      );
      assertThrows(
        () => psqlAsBob(`insert into crm.routing_rules (business_id, name, assign_to_employee_id) values ('${bobBusiness}', 'Sneaky', '${aliceEmployee}')`),
        "Bob cannot create a routing rule assigning to Alice's employee",
      );

      console.log("\nAll crm schema RLS checks passed.");
    },
  });
}

main();
