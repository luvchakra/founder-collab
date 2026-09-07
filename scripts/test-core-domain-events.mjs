#!/usr/bin/env node
/**
 * Behavior test for core.domain_events + core.record_domain_event_attempt() +
 * core.replay_parked_events() (Epic 3, story D-9; backlog requires a poison-message
 * test explicitly), via the shared harness (C-8). Covers retry/backoff progression,
 * poison-message failure after max_attempts, no_consumer parking, replay-on-license-
 * activation, and RLS (including that members can publish and read but never directly
 * mutate the drain bookkeeping columns).
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
    dbNamePrefix: "core_domain_events_test",
    migrationsDir: MIGRATIONS_DIR,
    stubFile: STUB_FILE,
    testFn: async ({ psql, psqlAs, assertEqual, assertThrows }) => {
      const psqlAsAlice = (sql) => psqlAs(ALICE, sql);
      const psqlAsBob = (sql) => psqlAs(BOB, sql);

      console.log("Seeding two tenants...");
      psql(`
        insert into auth.users (id, email) values
          ('${ALICE}', 'alice@example.com'),
          ('${BOB}', 'bob@example.com');
        grant usage on schema core to authenticated;
        grant select, insert, update, delete on all tables in schema core to authenticated;
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

      console.log("Publishing an event with no required_module...");
      const plainEvent = psqlAsAlice(`
        insert into core.domain_events (business_id, type, payload)
        values ('${aliceBusiness}', 'prospect.won', '{"prospect_id": "p1"}') returning id;
      `);
      assertEqual(psqlAsAlice(`select status from core.domain_events where id = '${plainEvent}'`), "pending", "a freshly published event starts pending");
      assertEqual(psqlAsAlice(`select attempts from core.domain_events where id = '${plainEvent}'`), "0", "a freshly published event has zero attempts");

      console.log("Verifying retry-with-backoff progression, then poison-message failure...");
      for (let i = 1; i <= 4; i++) {
        psql(`select core.record_domain_event_attempt('${plainEvent}', 'failed_retry', 'boom ${i}')`);
        assertEqual(psql(`select status from core.domain_events where id = '${plainEvent}'`), "pending", `after failure ${i}/5, status is still pending (retrying)`);
        assertEqual(psql(`select attempts from core.domain_events where id = '${plainEvent}'`), String(i), `after failure ${i}/5, attempts = ${i}`);
        assertEqual(psql(`select (next_attempt_at > now())::text from core.domain_events where id = '${plainEvent}'`), "true", `after failure ${i}/5, next_attempt_at is scheduled in the future (backoff)`);
      }
      // 5th failure hits max_attempts (default 5) -- this is the poison-message case.
      psql(`select core.record_domain_event_attempt('${plainEvent}', 'failed_retry', 'boom 5')`);
      assertEqual(psql(`select status from core.domain_events where id = '${plainEvent}'`), "failed", "the 5th failure gives up permanently (poison message)");
      assertEqual(psql(`select attempts from core.domain_events where id = '${plainEvent}'`), "5", "attempts reflects all 5 tries");
      assertEqual(psql(`select last_error from core.domain_events where id = '${plainEvent}'`), "boom 5", "last_error records the final failure's message");

      console.log("Verifying an immediate permanent failure (no handler registered)...");
      const noHandlerEvent = psqlAsAlice(`
        insert into core.domain_events (business_id, type) values ('${aliceBusiness}', 'nonexistent.type') returning id;
      `);
      psql(`select core.record_domain_event_attempt('${noHandlerEvent}', 'failed_permanent', 'No handler registered for event type "nonexistent.type".')`);
      assertEqual(psql(`select status from core.domain_events where id = '${noHandlerEvent}'`), "failed", "a permanent failure skips retries entirely");
      assertEqual(psql(`select attempts from core.domain_events where id = '${noHandlerEvent}'`), "1", "a permanent failure still counts as one attempt");

      console.log("Verifying successful processing...");
      const okEvent = psqlAsAlice(`insert into core.domain_events (business_id, type) values ('${aliceBusiness}', 'payment.recorded') returning id;`);
      psql(`select core.record_domain_event_attempt('${okEvent}', 'processed')`);
      assertEqual(psql(`select status from core.domain_events where id = '${okEvent}'`), "processed", "a successful attempt marks the event processed");
      assertEqual(psql(`select (processed_at is not null)::text from core.domain_events where id = '${okEvent}'`), "true", "processed_at is set");

      console.log("Verifying no_consumer parking + replay-on-license-activation...");
      const parkedEvent = psqlAsAlice(`
        insert into core.domain_events (business_id, type, required_module) values ('${aliceBusiness}', 'stock.reserve_requested', 'inventory') returning id;
      `);
      psql(`select core.record_domain_event_attempt('${parkedEvent}', 'parked')`);
      assertEqual(psql(`select status from core.domain_events where id = '${parkedEvent}'`), "parked", "an event needing an unlicensed module is parked, not failed or retried");
      assertEqual(psql(`select attempts from core.domain_events where id = '${parkedEvent}'`), "0", "parking does not count as a failed attempt");

      // Simulate the module actually getting bought.
      psql(`
        insert into core.licenses (account_id, business_id, module_key, status)
        select account_id, id, 'inventory', 'active' from core.businesses where id = '${aliceBusiness}';
      `);
      const replayCount = psql(`select core.replay_parked_events('${aliceBusiness}', 'inventory')`);
      assertEqual(replayCount, "1", "replaying returns how many events it un-parked");
      assertEqual(psql(`select status from core.domain_events where id = '${parkedEvent}'`), "pending", "the parked event is pending again after its module is licensed");
      assertEqual(psql(`select (next_attempt_at <= now())::text from core.domain_events where id = '${parkedEvent}'`), "true", "the replayed event is immediately due, not still waiting on old backoff");

      console.log("Verifying replaying again (nothing left parked) un-parks nothing...");
      assertEqual(psql(`select core.replay_parked_events('${aliceBusiness}', 'inventory')`), "0", "replaying with nothing parked returns 0, not an error");

      console.log("Verifying tenant isolation (read)...");
      assertEqual(psqlAsBob("select count(*) from core.domain_events"), "0", "Bob sees none of Alice's domain events");
      assertEqual(psqlAsAlice("select count(*) from core.domain_events"), "4", "Alice sees all four of her own events");

      console.log("Verifying members can publish but never directly mutate drain bookkeeping...");
      assertThrows(
        () => psqlAsBob(`insert into core.domain_events (business_id, type) values ('${aliceBusiness}', 'sneaky')`),
        "Bob cannot publish an event for Alice's business",
      );
      psqlAsAlice(`update core.domain_events set status = 'processed' where id = '${plainEvent}'`);
      assertEqual(psql(`select status from core.domain_events where id = '${plainEvent}'`), "failed", "a member's direct UPDATE has no effect at all -- no UPDATE policy exists, so it's a silent no-op, not an error");

      console.log("\nAll core.domain_events checks passed.");
    },
  });
}

main();
