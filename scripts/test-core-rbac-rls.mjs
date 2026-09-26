#!/usr/bin/env node
/**
 * RBAC-33..RBAC-36 (RBAC-34: cross-business isolation below; RBAC-38: run with the full
 * `npm run test:db` regression suite) -- the §55 testing matrix, against the real migration timeline
 * (docs/plan/15-MULTI-USER-RBAC-BACKLOG.md). Proves in the database itself -- not the UI --
 * that:
 *   - owner holds every permission; admin, viewer and custom roles hold exactly their grants;
 *   - no membership, suspended and removed all mean no access at all;
 *   - licensed + no permission is denied, and permission + no licence is denied;
 *   - a user who is admin in business A and viewer in business B keeps them separate;
 *   - the privilege ceiling holds: an admin can't assign owner, can't grant what they
 *     lack, and nobody can change their own role; direct writes to memberships are refused;
 *   - invitations are bound to the invited email, single-use, expire, can be revoked, and
 *     a double acceptance makes one membership;
 *   - the last owner can't be removed or demoted; custom roles in use can't be archived.
 */
import { join } from "node:path";
import { withTestDatabase } from "./lib/rls-test-harness.mjs";

const ROOT = new URL("..", import.meta.url).pathname;
const MIGRATIONS_DIR = join(ROOT, "supabase", "migrations");
const STUB_FILE = join(ROOT, "supabase", "tests", "local-stub.sql");

const OWEN = "77777777-7777-7777-7777-7777777777a1"; // owner of business A
const ADA = "77777777-7777-7777-7777-7777777777a2"; // admin in A, viewer in B
const VIC = "77777777-7777-7777-7777-7777777777a3"; // viewer in A
const CARL = "77777777-7777-7777-7777-7777777777a4"; // custom role in A
const SAM = "77777777-7777-7777-7777-7777777777a5"; // suspended in A
const NOAH = "77777777-7777-7777-7777-7777777777a6"; // no membership anywhere (owns an empty account)
const BETH = "77777777-7777-7777-7777-7777777777b1"; // owner of business B
const INA = "77777777-7777-7777-7777-7777777777c1"; // invitee
const HASH = (c) => c.repeat(64);

async function main() {
  await withTestDatabase({
    dbNamePrefix: "core_rbac_test",
    migrationsDir: MIGRATIONS_DIR,
    stubFile: STUB_FILE,
    testFn: async ({ psql, psqlAs, assertEqual, assertThrows }) => {
      console.log("Seeding two businesses and their people...");
      psql(`
        insert into auth.users (id, email) values
          ('${OWEN}', 'owen@example.com'), ('${ADA}', 'ada@example.com'), ('${VIC}', 'vic@example.com'),
          ('${CARL}', 'carl@example.com'), ('${SAM}', 'sam@example.com'), ('${NOAH}', 'noah@example.com'),
          ('${BETH}', 'beth@example.com'), ('${INA}', 'ina@example.com');
      `);
      const bizA = psql(`insert into core.businesses (account_id, name) select account_id, 'Business A' from core.account_members where user_id = '${OWEN}' returning id`);
      const bizB = psql(`insert into core.businesses (account_id, name) select account_id, 'Business B' from core.account_members where user_id = '${BETH}' returning id`);
      // The app's own "creator becomes owner" insert, through RLS.
      psqlAs(OWEN, `insert into core.business_members (business_id, user_id, role) values ('${bizA}', '${OWEN}', 'owner')`);
      psqlAs(BETH, `insert into core.business_members (business_id, user_id, role) values ('${bizB}', '${BETH}', 'owner')`);
      psql(`
        insert into core.business_members (business_id, user_id, role) values
          ('${bizA}', '${ADA}', 'admin'), ('${bizA}', '${VIC}', 'viewer'), ('${bizA}', '${SAM}', 'viewer'),
          ('${bizB}', '${ADA}', 'viewer');
        update core.business_members set status = 'suspended' where user_id = '${SAM}';
        insert into core.licenses (account_id, business_id, module_key, status)
        select b.account_id, b.id, m, 'active' from core.businesses b, unnest(array['inventory','crm']) m where b.id in ('${bizA}', '${bizB}');
      `);
      const perm = (who, biz, key) => psqlAs(who, `select core.has_permission('${biz}', '${key}')`);

      console.log("Role permissions...");
      assertEqual(perm(OWEN, bizA, "finance.reports.export"), "t", "owner holds every permission");
      assertEqual(perm(ADA, bizA, "members.invite"), "t", "admin holds admin grants");
      assertEqual(perm(ADA, bizA, "billing.subscription.change"), "f", "admin doesn't hold billing changes by default");
      assertEqual(perm(VIC, bizA, "inventory.view"), "t", "viewer can view");
      assertEqual(perm(VIC, bizA, "inventory.edit"), "f", "viewer can't edit");
      assertEqual(perm(SAM, bizA, "inventory.view"), "f", "suspended member holds nothing");
      assertEqual(perm(NOAH, bizA, "inventory.view"), "f", "no membership holds nothing");

      console.log("The switcher's per-business role (RBAC-31)...");
      assertEqual(
        psqlAs(ADA, `select string_agg(role_name, ',' order by role_name) from core.my_business_access()`),
        "Admin,Viewer",
        "Ada is Admin in one business and Viewer in the other",
      );
      assertEqual(psqlAs(ADA, `select 'members.invite' = any(permissions) from core.my_business_access() where business_id = '${bizB}'`), "f", "and her B permissions are B's alone");

      console.log("Tenancy...");
      assertEqual(psqlAs(VIC, `select count(*) from core.businesses`), "1", "a member sees only their business");
      assertEqual(psqlAs(SAM, `select count(*) from core.businesses where id = '${bizA}'`), "0", "a suspended member can't see the business");
      assertEqual(psqlAs(NOAH, `select count(*) from core.businesses`), "0", "no membership, no business");
      assertEqual(psqlAs(ADA, `select count(*) from core.businesses`), "2", "Ada sees both of her businesses");

      console.log("Module data: tenant AND licensed AND permission...");
      psql(`
        insert into inventory.warehouses (business_id, name, code) values ('${bizA}', 'A main', 'A1'), ('${bizB}', 'B main', 'B1');
      `);
      assertEqual(psqlAs(VIC, `select count(*) from inventory.warehouses`), "1", "viewer reads licensed module data");
      assertThrows(() => psqlAs(VIC, `insert into inventory.warehouses (business_id, name, code) values ('${bizA}', 'nope', 'N1')`), "viewer can't write module data (DB-enforced)");
      assertEqual(psqlAs(ADA, `select string_agg(name, ',' order by name) from inventory.warehouses`), "A main,B main", "Ada reads both");
      psqlAs(ADA, `insert into inventory.warehouses (business_id, name, code) values ('${bizA}', 'A second', 'A2')`);
      assertThrows(() => psqlAs(ADA, `insert into inventory.warehouses (business_id, name, code) values ('${bizB}', 'B second', 'B2')`), "Ada's admin rights in A don't carry into B, where she is a viewer");
      assertEqual(psqlAs(ADA, `with u as (update inventory.warehouses set name = 'renamed' where business_id = '${bizB}' returning id) select count(*) from u`), "0", "Ada can't update B's data");
      psql(`update core.licenses set status = 'expired' where business_id = '${bizA}' and module_key = 'inventory'`);
      assertEqual(psqlAs(OWEN, `select count(*) from inventory.warehouses where business_id = '${bizA}'`), "0", "permission without a licence is denied, even for the owner");
      psql(`update core.licenses set status = 'active' where business_id = '${bizA}' and module_key = 'inventory'`);
      psql(`delete from core.role_permission_grants where role_id = (select id from core.roles where key = 'viewer' and business_id is null) and permission_key = 'crm.view'`);
      psql(`insert into crm.escalation_config (business_id) values ('${bizA}')`);
      assertEqual(psqlAs(VIC, `select count(*) from crm.escalation_config`), "0", "a licence without the view permission is denied");
      psql(`insert into core.role_permission_grants (role_id, permission_key) select id, 'crm.view' from core.roles where key = 'viewer' and business_id is null`);

      console.log("Direct writes and the privilege ceiling...");
      assertThrows(() => psqlAs(VIC, `update core.business_members set role = 'owner' where user_id = '${VIC}'`), "nobody edits memberships directly");
      assertThrows(() => psqlAs(ADA, `insert into core.business_members (business_id, user_id, role) values ('${bizA}', '${NOAH}', 'owner')`), "an admin can't insert an owner directly");
      const viVicMember = psql(`select id from core.business_members where user_id = '${VIC}' and business_id = '${bizA}'`);
      const adaMemberA = psql(`select id from core.business_members where user_id = '${ADA}' and business_id = '${bizA}'`);
      const ownerRole = psql(`select id from core.roles where key = 'owner' and business_id is null`);
      const adminRole = psql(`select id from core.roles where key = 'admin' and business_id is null`);
      const accountantRole = psql(`select id from core.roles where key = 'accountant' and business_id is null`);
      assertThrows(() => psqlAs(ADA, `select core.change_member_role('${viVicMember}', '${ownerRole}')`), "an admin can't assign owner");
      assertThrows(() => psqlAs(VIC, `select core.change_member_role('${viVicMember}', '${adminRole}')`), "a viewer can't change their own role");
      assertThrows(() => psqlAs(ADA, `select core.change_member_role('${adaMemberA}', '${ownerRole}')`), "an admin can't elevate themselves");
      assertThrows(
        () => psqlAs(ADA, `select core.create_role('${bizA}', 'Billing boss', null, array['billing.subscription.change'], null)`),
        "an admin can't create a role with a permission they don't hold",
      );
      psqlAs(ADA, `select core.change_member_role('${viVicMember}', '${accountantRole}')`);
      assertEqual(perm(VIC, bizA, "finance.view"), "t", "a permitted role change applies at once");
      assertEqual(psql(`select count(*) from core.audit_log where action = 'member.role_changed' and actor_id = '${ADA}'`), "1", "role change is audited with its actor");

      console.log("Custom roles...");
      const custom = psqlAs(ADA, `select core.create_role('${bizA}', 'Warehouse Viewer', 'Sees stock', array['business.view','inventory.view'], null)`);
      psql(`insert into core.business_members (business_id, user_id, role_id, role) values ('${bizA}', '${CARL}', '${custom}', 'viewer')`);
      assertEqual(psql(`select role from core.business_members where user_id = '${CARL}'`), "custom", "the legacy role column reads 'custom'");
      assertEqual(perm(CARL, bizA, "inventory.view"), "t", "custom role grants exactly its permissions");
      assertEqual(perm(CARL, bizA, "crm.view"), "f", "and nothing more");
      assertEqual(psqlAs(CARL, `select count(*) from crm.escalation_config`), "0", "no CRM view, no CRM data");
      psqlAs(ADA, `select core.update_role('${custom}', 'Warehouse Viewer', 'Sees stock', array['business.view'])`);
      assertEqual(perm(CARL, bizA, "inventory.view"), "f", "revoking a permission takes effect on the next check");
      assertThrows(() => psqlAs(ADA, `select core.archive_role('${custom}')`), "a role in use can't be archived");
      assertThrows(() => psqlAs(ADA, `select core.update_role('${adminRole}', 'x', null, array[]::text[])`), "system roles can't be edited");

      console.log("Suspension and removal...");
      const carlMember = psql(`select id from core.business_members where user_id = '${CARL}'`);
      psqlAs(ADA, `select core.set_member_status('${carlMember}', 'suspended', 'test')`);
      assertEqual(psqlAs(CARL, `select count(*) from core.businesses`), "0", "suspended: access denied");
      assertEqual(psql(`select role_id = '${custom}' from core.business_members where id = '${carlMember}'`), "t", "suspended: role retained");
      psqlAs(ADA, `select core.set_member_status('${carlMember}', 'active', null)`);
      assertEqual(psqlAs(CARL, `select count(*) from core.businesses`), "1", "reactivation restores access");
      psqlAs(ADA, `select core.set_member_status('${carlMember}', 'removed', 'left')`);
      assertEqual(psqlAs(CARL, `select count(*) from core.businesses`), "0", "removed: access denied");
      psqlAs(ADA, `select core.archive_role('${custom}')`);
      const ownerMember = psql(`select id from core.business_members where user_id = '${OWEN}' and business_id = '${bizA}'`);
      assertThrows(() => psqlAs(ADA, `select core.set_member_status('${ownerMember}', 'removed', null)`), "an admin can't remove the owner");
      assertThrows(() => psql(`update core.business_members set status = 'removed' where id = '${ownerMember}'`), "the last owner can't be removed, even directly");

      console.log("Invitations...");
      const expires = "now() + interval '7 days'";
      psqlAs(ADA, `select core.invite_member('${bizA}', ' Ina@Example.com ', 'Ina', '${accountantRole}', null, '${HASH("a")}', ${expires})`);
      assertThrows(() => psqlAs(ADA, `select core.invite_member('${bizA}', 'x@example.com', null, '${ownerRole}', null, '${HASH("b")}', ${expires})`), "an admin can't invite an owner");
      assertThrows(() => psqlAs(VIC, `select core.invite_member('${bizA}', 'y@example.com', null, '${accountantRole}', null, '${HASH("c")}', ${expires})`), "a member without members.invite can't invite");
      assertEqual(psqlAs(NOAH, `select status from core.get_invitation('${HASH("a")}')`), "wrong_account", "someone else can't read the invitation's details");
      assertThrows(() => psqlAs(NOAH, `select core.accept_invitation('${HASH("a")}')`), "someone else can't accept it");
      assertEqual(psqlAs(INA, `select status || ':' || business_name || ':' || role_name from core.get_invitation('${HASH("a")}')`), "pending:Business A:Accountant", "the invitee sees the business and role");
      assertEqual(psqlAs(INA, `select core.accept_invitation('${HASH("a")}') = '${bizA}'`), "t", "the invitee accepts");
      assertEqual(psqlAs(INA, `select core.accept_invitation('${HASH("a")}') = '${bizA}'`), "t", "accepting twice is harmless");
      assertEqual(psql(`select count(*) from core.business_members where user_id = '${INA}'`), "1", "one membership");
      assertEqual(perm(INA, bizA, "finance.view"), "t", "the invited role applies");
      assertEqual(psqlAs(INA, `select count(*) from core.businesses where id = '${bizB}'`), "0", "and grants nothing in any other business");
      psqlAs(ADA, `select core.invite_member('${bizA}', 'late@example.com', null, '${accountantRole}', null, '${HASH("d")}', now() + interval '1 second')`);
      psql(`update core.business_invitations set expires_at = now() - interval '1 minute' where token_hash = '${HASH("d")}'`);
      psql(`insert into auth.users (id, email) values ('77777777-7777-7777-7777-7777777777d1', 'late@example.com')`);
      assertThrows(() => psqlAs("77777777-7777-7777-7777-7777777777d1", `select core.accept_invitation('${HASH("d")}')`), "an expired invitation is refused");
      psqlAs(ADA, `select core.invite_member('${bizA}', 'rev@example.com', null, '${accountantRole}', null, '${HASH("e")}', ${expires})`);
      const revId = psql(`select id from core.business_invitations where token_hash = '${HASH("e")}'`);
      psqlAs(ADA, `select core.revoke_invitation('${revId}')`);
      psql(`insert into auth.users (id, email) values ('77777777-7777-7777-7777-7777777777d2', 'rev@example.com')`);
      assertThrows(() => psqlAs("77777777-7777-7777-7777-7777777777d2", `select core.accept_invitation('${HASH("e")}')`), "a revoked invitation is refused");
      assertEqual(psql(`select count(*) from core.audit_log where action in ('member.invited', 'member.invitation_accepted')`), "4", "invitations are audited");
      assertEqual(psql(`select count(*) from core.audit_log where after::text like '%${"a".repeat(64)}%'`), "0", "no token hash in the audit trail");

      console.log("Ownership transfer...");
      const inaMember = psql(`select id from core.business_members where user_id = '${INA}'`);
      assertThrows(() => psqlAs(ADA, `select core.transfer_ownership('${bizA}', '${inaMember}')`), "only an owner transfers ownership");
      psqlAs(OWEN, `select core.transfer_ownership('${bizA}', '${adaMemberA}')`);
      assertEqual(psql(`select string_agg(u.email || '=' || m.role, ',' order by u.email) from core.business_members m join auth.users u on u.id = m.user_id where m.business_id = '${bizA}' and m.role in ('owner','admin')`), "ada@example.com=owner,owen@example.com=admin", "the new owner is in, the old owner became admin");
      console.log("\nAll RBAC checks passed.");
    },
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
