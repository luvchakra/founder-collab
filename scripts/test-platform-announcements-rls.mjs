#!/usr/bin/env node
/**
 * RLS + behavior test for `platform.announcements`/`platform.announcement_events`
 * (PLATFORM-P0-15.1/15.2/15.3/15.4, "Global Announcements / Maintenance",
 * docs/plan/09-PLATFORM-ADMIN-PORTAL-BACKLOG.md §19). Same harness and bar every sibling
 * `platform.*` migration in this backlog has been held to.
 *
 * What this proves that reading the migration's own SQL does not:
 *   - the audience-shape CHECK constraint really rejects a mismatched audience_type/
 *     audience-value combination, for all four audience types;
 *   - the maintenance-only CHECK really rejects a maintenance window/affected_modules on a
 *     non-maintenance announcement, and requires them to be empty for one;
 *   - `create_announcement`/`update_announcement`/`delete_announcement` genuinely reject a
 *     non-superadmin, with zero residue in either table;
 *   - a reason is required unconditionally, for all three mutation functions;
 *   - `affected_modules` is validated against real `core.modules` keys, not accepted
 *     blindly;
 *   - create/update/delete each write exactly one atomic audit event with a real
 *     before/after JSONB snapshot;
 *   - deleting an announcement nulls the audit trail's own `announcement_id` (via
 *     `on delete set null`) while the event itself survives, addressable by its
 *     denormalized `title`;
 *   - `update_announcement` never touches `type`/`audience_type`/its target (immutable
 *     after creation);
 *   - nobody -- including a superadmin -- can bypass the three functions with a direct
 *     INSERT/UPDATE/DELETE on either table.
 */
import { join } from "node:path";
import { withTestDatabase } from "./lib/rls-test-harness.mjs";

const ROOT = new URL("..", import.meta.url).pathname;
const MIGRATIONS_DIR = join(ROOT, "supabase", "migrations");
const STUB_FILE = join(ROOT, "supabase", "tests", "local-stub.sql");

const ALICE = "88888888-8888-8888-8888-888888888883"; // business admin -- NOT a superadmin
const ZOE = "88888888-8888-8888-8888-888888888884"; // real platform superadmin

async function main() {
  await withTestDatabase({
    dbNamePrefix: "platform_announcements_test",
    migrationsDir: MIGRATIONS_DIR,
    stubFile: STUB_FILE,
    testFn: async ({ psql, psqlAs, assertEqual, assertThrows }) => {
      const psqlAsAlice = (sql) => psqlAs(ALICE, sql);
      const psqlAsZoe = (sql) => psqlAs(ZOE, sql);

      console.log("Seeding a business admin (Alice) and a platform superadmin (Zoe)...");
      psql(`
        insert into auth.users (id, email) values
          ('${ALICE}', 'alice-announcements@example.com'),
          ('${ZOE}', 'zoe-announcements@example.com');
        grant usage on schema core to authenticated;
        grant select, insert, update, delete on all tables in schema core to authenticated;
      `);
      const aliceBiz = psql(`
        insert into core.businesses (account_id, name)
        select account_id, 'Alice Co' from core.account_members where user_id = '${ALICE}'
        returning id;
      `);
      psql(`
        insert into core.business_members (business_id, user_id, role)
        values ('${aliceBiz}', '${ALICE}', 'admin');
        set local role service_role;
        insert into platform.admins (user_id) values ('${ZOE}');
      `);

      const proPlanId = psql(`select id from platform.plans where key = 'pro'`);
      const inCountry = psql(`select country_code from platform.compliance_countries where country_code = 'IN'`);

      console.log("Verifying the catalog starts empty (no fabricated seed)...");
      assertEqual(psql(`select count(*) from platform.announcements`), "0", "no announcements seeded");
      assertEqual(psql(`select count(*) from platform.announcement_events`), "0", "no events seeded");

      console.log("Verifying a business admin (not a superadmin) can read but not write via the functions...");
      assertEqual(psqlAsAlice(`select count(*) from platform.announcements`), "0", "Alice can read the (empty) catalog");
      assertThrows(
        () =>
          psqlAsAlice(
            `select * from platform.create_announcement('information', 'Test', 'msg', 'all_customers', null, null, null, null, null, null, '{}', true, 'trying to create')`,
          ),
        "Alice's create attempt is rejected by the function's own internal check",
      );
      assertEqual(psql(`set local role service_role; select count(*) from platform.announcements`), "0", "zero residue after Alice's rejected create");
      assertEqual(psql(`set local role service_role; select count(*) from platform.announcement_events`), "0", "zero residue in the audit trail too");

      console.log("Verifying the audience-shape CHECK constraint for all four audience types...");
      assertThrows(
        () =>
          psqlAsZoe(
            `select * from platform.create_announcement('information', 'Bad', 'msg', 'all_customers', '${proPlanId}', null, null, null, null, null, '{}', true, 'all_customers with a plan')`,
          ),
        "audience_type='all_customers' with a non-null audience_plan_id is rejected",
      );
      assertThrows(
        () =>
          psqlAsZoe(
            `select * from platform.create_announcement('information', 'Bad', 'msg', 'specific_plan', null, null, null, null, null, null, '{}', true, 'missing audience_plan_id')`,
          ),
        "audience_type='specific_plan' with no audience_plan_id is rejected",
      );
      assertThrows(
        () =>
          psqlAsZoe(
            `select * from platform.create_announcement('information', 'Bad', 'msg', 'specific_country', null, null, null, null, null, null, '{}', true, 'missing audience_country_code')`,
          ),
        "audience_type='specific_country' with no audience_country_code is rejected",
      );
      assertThrows(
        () =>
          psqlAsZoe(
            `select * from platform.create_announcement('information', 'Bad', 'msg', 'specific_plan', '${proPlanId}', '${inCountry}', null, null, null, null, '{}', true, 'both plan and country')`,
          ),
        "specifying both audience_plan_id and audience_country_code is rejected",
      );

      console.log("Verifying the maintenance-only CHECK constraint...");
      assertThrows(
        () =>
          psqlAsZoe(
            `select * from platform.create_announcement('information', 'Bad', 'msg', 'all_customers', null, null, null, null, '2026-06-01T00:00:00Z', '2026-06-02T00:00:00Z', '{}', true, 'maintenance window on a non-maintenance type')`,
          ),
        "a maintenance window on a non-maintenance announcement is rejected",
      );
      assertThrows(
        () =>
          psqlAsZoe(
            `select * from platform.create_announcement('warning', 'Bad', 'msg', 'all_customers', null, null, null, null, null, null, '{gst}', true, 'affected_modules on a non-maintenance type')`,
          ),
        "affected_modules on a non-maintenance announcement is rejected",
      );
      assertThrows(
        () =>
          psqlAsZoe(
            `select * from platform.create_announcement('maintenance', 'Bad', 'msg', 'all_customers', null, null, null, null, '2026-06-02T00:00:00Z', '2026-06-01T00:00:00Z', '{}', true, 'end before start')`,
          ),
        "maintenance_end at or before maintenance_start is rejected",
      );

      console.log("Verifying affected_modules is validated against real core.modules keys...");
      assertThrows(
        () =>
          psqlAsZoe(
            `select * from platform.create_announcement('maintenance', 'Bad', 'msg', 'all_customers', null, null, null, null, '2026-06-01T00:00:00Z', '2026-06-02T00:00:00Z', '{not_a_real_module}', true, 'unknown module key')`,
          ),
        "an unknown module key in affected_modules is rejected",
      );

      console.log("Verifying a genuine superadmin (Zoe) can create a real maintenance announcement...");
      const maintId = psqlAsZoe(
        `select id from platform.create_announcement('maintenance', 'Scheduled maintenance', 'GST filing will be briefly unavailable.', 'all_customers', null, null, null, null, '2026-06-01T02:00:00Z', '2026-06-01T04:00:00Z', '{gst}', true, 'announcing next weekend maintenance window')`,
      );
      assertEqual(psqlAsZoe(`select count(*) from platform.announcements`), "1", "one announcement now exists");
      assertEqual(
        psqlAsZoe(`select type || ':' || array_to_string(affected_modules, ',') from platform.announcements where id = '${maintId}'`),
        "maintenance:gst",
        "the announcement was created with the exact type/affected_modules requested",
      );
      assertEqual(
        psqlAsZoe(
          `select action || ':' || (previous_value is null)::text || ':' || (new_value ->> 'type') from platform.announcement_events where announcement_id = '${maintId}'`,
        ),
        "created:true:maintenance",
        "exactly one 'created' event, no previous_value, new_value carries the real row",
      );

      console.log("Verifying a real plan-specific and country-specific announcement can each be created...");
      const planId = psqlAsZoe(
        `select id from platform.create_announcement('information', 'Pro-only notice', 'msg', 'specific_plan', '${proPlanId}', null, null, null, null, null, '{}', true, 'plan-specific notice')`,
      );
      assertEqual(
        psqlAsZoe(`select audience_type || ':' || audience_plan_id from platform.announcements where id = '${planId}'`),
        `specific_plan:${proPlanId}`,
        "plan-specific announcement stores the plan id correctly",
      );
      const countryId = psqlAsZoe(
        `select id from platform.create_announcement('warning', 'India notice', 'msg', 'specific_country', null, '${inCountry}', null, null, null, null, '{}', true, 'country-specific notice')`,
      );
      assertEqual(
        psqlAsZoe(`select audience_type || ':' || audience_country_code from platform.announcements where id = '${countryId}'`),
        "specific_country:IN",
        "country-specific announcement stores the country code correctly",
      );

      console.log("Verifying the publish/expire window CHECK constraint...");
      assertThrows(
        () =>
          psqlAsZoe(
            `select * from platform.create_announcement('information', 'Bad', 'msg', 'all_customers', null, null, '2026-06-02T00:00:00Z', '2026-06-01T00:00:00Z', null, null, '{}', true, 'expire before publish')`,
          ),
        "expire_at at or before publish_at is rejected",
      );

      console.log("Verifying an empty/whitespace reason is rejected for every mutation function...");
      assertThrows(
        () =>
          psqlAsZoe(
            `select * from platform.create_announcement('information', 'No reason', 'msg', 'all_customers', null, null, null, null, null, null, '{}', true, '')`,
          ),
        "create rejects an empty reason",
      );
      assertThrows(
        () =>
          psqlAsZoe(
            `select * from platform.update_announcement('${maintId}', 'x', 'y', null, null, '2026-06-01T02:00:00Z', '2026-06-01T04:00:00Z', '{gst}', true, '   ')`,
          ),
        "update rejects a whitespace-only reason",
      );
      assertThrows(() => psqlAsZoe(`select * from platform.delete_announcement('${maintId}', '')`), "delete rejects an empty reason");
      assertEqual(psqlAsZoe(`select count(*) from platform.announcements`), "3", "still exactly 3 announcements -- no partial writes from the rejected calls above");

      console.log("Verifying update_announcement mutates only title/message/schedule/maintenance window/affected_modules/enabled, never type/audience...");
      psqlAsZoe(
        `select * from platform.update_announcement('${maintId}', 'Rescheduled maintenance', 'New window.', null, null, '2026-06-08T02:00:00Z', '2026-06-08T04:00:00Z', '{gst,inventory}', false, 'rescheduling to next week')`,
      );
      assertEqual(
        psqlAsZoe(
          `select title || ':' || enabled::text || ':' || type || ':' || audience_type || ':' || array_to_string(affected_modules, ',') from platform.announcements where id = '${maintId}'`,
        ),
        "Rescheduled maintenance:false:maintenance:all_customers:gst,inventory",
        "title/enabled/affected_modules changed; type/audience_type untouched (the function has no such parameters)",
      );

      console.log("Verifying update_announcement writes exactly one atomic audit event with a real before/after snapshot...");
      assertEqual(
        psqlAsZoe(
          `select action || ':' || (previous_value ->> 'enabled') || ':' || (new_value ->> 'enabled') from platform.announcement_events where announcement_id = '${maintId}' order by performed_at desc limit 1`,
        ),
        "updated:true:false",
        "the audit row captures the real previous/new 'enabled' value inside the JSONB snapshot",
      );

      console.log("Verifying Alice cannot update or delete an existing announcement either, with zero residue...");
      assertThrows(
        () =>
          psqlAsAlice(
            `select * from platform.update_announcement('${planId}', 'x', 'y', null, null, null, null, '{}', false, 'trying to disable')`,
          ),
        "Alice's update attempt is rejected",
      );
      assertThrows(() => psqlAsAlice(`select * from platform.delete_announcement('${planId}', 'trying to delete')`), "Alice's delete attempt is rejected");
      assertEqual(
        psql(`set local role service_role; select enabled from platform.announcements where id = '${planId}'`),
        "t",
        "the plan-specific announcement is untouched by Alice's rejected attempts",
      );

      console.log("Verifying an unknown announcement id is rejected by update/delete...");
      assertThrows(
        () =>
          psqlAsZoe(
            `select * from platform.update_announcement('00000000-0000-0000-0000-000000000000', 'x', 'y', null, null, null, null, '{}', true, 'testing')`,
          ),
        "update rejects an unknown announcement id",
      );
      assertThrows(
        () => psqlAsZoe(`select * from platform.delete_announcement('00000000-0000-0000-0000-000000000000', 'testing')`),
        "delete rejects an unknown announcement id",
      );

      console.log("Verifying delete_announcement: one 'deleted' event with a full snapshot, announcement_id nulled by the FK, title preserved...");
      const eventCountBefore = Number(psqlAsZoe(`select count(*) from platform.announcement_events`));
      psqlAsZoe(`select * from platform.delete_announcement('${countryId}', 'notice retracted')`);
      assertEqual(psqlAsZoe(`select count(*) from platform.announcements`), "2", "the announcement is really gone");
      assertEqual(
        psqlAsZoe(`select count(*) from platform.announcement_events`),
        String(eventCountBefore + 1),
        "exactly one new audit event for the deletion",
      );
      assertEqual(
        psqlAsZoe(
          `select action || ':' || (announcement_id is null)::text || ':' || title || ':' || (previous_value ->> 'title') from platform.announcement_events where title = 'India notice' order by performed_at desc limit 1`,
        ),
        "deleted:true:India notice:India notice",
        "the deletion event survives with announcement_id nulled (on delete set null) but title/previous_value intact",
      );

      console.log("Verifying read access to the audit trail: superadmin-only, unlike the open platform.announcements catalog...");
      assertEqual(psqlAsAlice(`select count(*) from platform.announcement_events`), "0", "Alice gets zero rows from the audit trail");
      assertEqual(psqlAsZoe(`select count(*) > 0 from platform.announcement_events`).toString(), "t", "Zoe (superadmin) can read it");

      console.log("Verifying nobody -- including a superadmin -- can bypass the functions with a direct write...");
      assertThrows(
        () => psqlAsZoe(`insert into platform.announcements (type, title, message, audience_type) values ('information', 'bypass', 'msg', 'all_customers')`),
        "even a superadmin cannot INSERT directly into platform.announcements -- no grant exists",
      );
      assertThrows(
        () => psqlAsZoe(`update platform.announcements set enabled = false where id = '${planId}'`),
        "even a superadmin cannot UPDATE platform.announcements directly -- no grant exists",
      );
      assertThrows(
        () => psqlAsZoe(`delete from platform.announcements where id = '${planId}'`),
        "even a superadmin cannot DELETE from platform.announcements directly -- no grant exists",
      );
      assertThrows(
        () =>
          psqlAsZoe(
            `insert into platform.announcement_events (title, action, reason) values ('bypass', 'created', 'bypass attempt')`,
          ),
        "even a superadmin cannot INSERT directly into the audit table",
      );

      console.log("\nAll platform.announcements / platform.announcement_events checks passed.");
    },
  });
}

main();
