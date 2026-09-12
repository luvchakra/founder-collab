#!/usr/bin/env node
/**
 * Tenant-isolation + license/permission-gating + cross-reference-guard test for
 * `gst.compliance_evidence` (COMPLY-P0-10.1). Attachment rows are inserted directly as
 * plain `core.attachments` metadata (same convenience `test-core-tags-fields-attachments
 * -rls.mjs` already uses) -- no real Storage upload is needed to exercise this table's
 * own RLS/constraints.
 */
import { join } from "node:path";
import { withTestDatabase } from "./lib/rls-test-harness.mjs";

const ROOT = new URL("..", import.meta.url).pathname;
const MIGRATIONS_DIR = join(ROOT, "supabase", "migrations");
const STUB_FILE = join(ROOT, "supabase", "tests", "local-stub.sql");

const ALICE = "11111111-1111-1111-1111-111111111111"; // owner
const CAROL = "33333333-3333-3333-3333-333333333333"; // viewer, no gst.manage_evidence
const BOB = "22222222-2222-2222-2222-222222222222"; // separate business

async function main() {
  await withTestDatabase({
    dbNamePrefix: "gst_compliance_evidence_rls_test",
    migrationsDir: MIGRATIONS_DIR,
    stubFile: STUB_FILE,
    testFn: async ({ psql, psqlAs, assertEqual, assertThrows }) => {
      const psqlAsAlice = (sql) => psqlAs(ALICE, sql);
      const psqlAsCarol = (sql) => psqlAs(CAROL, sql);
      const psqlAsBob = (sql) => psqlAs(BOB, sql);

      psql(`
        insert into auth.users (id, email) values
          ('${ALICE}', 'alice@example.com'),
          ('${CAROL}', 'carol@example.com'),
          ('${BOB}', 'bob@example.com');
        grant usage on schema core to authenticated;
        grant select, insert, update, delete on all tables in schema core to authenticated;
        grant usage on schema gst to authenticated;
        grant select, insert on gst.compliance_evidence to authenticated;
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
      psql(`
        insert into core.account_members (account_id, user_id, role)
        select account_id, '${CAROL}', 'member' from core.businesses where id = '${aliceBusiness}';
        insert into core.business_members (business_id, user_id, role) values
          ('${aliceBusiness}', '${ALICE}', 'owner'),
          ('${aliceBusiness}', '${CAROL}', 'viewer'),
          ('${bobBusiness}', '${BOB}', 'owner');
        insert into core.licenses (account_id, business_id, module_key, status)
        select account_id, id, 'gst', 'active' from core.businesses where id in ('${aliceBusiness}', '${bobBusiness}');
      `);

      const aliceAttachment = psqlAsAlice(`
        insert into core.attachments (business_id, entity_type, entity_id, storage_path, file_name, content_type, size_bytes)
        values ('${aliceBusiness}', 'gst_business', '${aliceBusiness}', '${aliceBusiness}/some-id/ack.pdf', 'ack.pdf', 'application/pdf', 2048)
        returning id;
      `);
      const bobAttachment = psqlAsBob(`
        insert into core.attachments (business_id, entity_type, entity_id, storage_path, file_name, content_type, size_bytes)
        values ('${bobBusiness}', 'gst_business', '${bobBusiness}', '${bobBusiness}/some-id/ack.pdf', 'ack.pdf', 'application/pdf', 2048)
        returning id;
      `);

      const insertEvidence = (business, attachment, evidenceType) => `
        insert into gst.compliance_evidence (business_id, attachment_id, evidence_type)
        values ('${business}', '${attachment}', '${evidenceType}')
        returning id
      `;

      console.log("Carol (viewer, no gst.manage_evidence) cannot record evidence...");
      assertThrows(() => psqlAsCarol(insertEvidence(aliceBusiness, aliceAttachment, "return_acknowledgment")), "Carol lacks gst.manage_evidence");

      console.log("Alice (owner) can record evidence for her own attachment...");
      const evidence1 = psqlAsAlice(insertEvidence(aliceBusiness, aliceAttachment, "return_acknowledgment"));

      console.log("An unrecognized evidence_type is rejected by the check constraint...");
      assertThrows(() => psqlAsAlice(insertEvidence(aliceBusiness, aliceAttachment, "made_up_type")), "evidence_type check constraint");

      console.log("A DIFFERENT attachment can carry a second evidence row for the same business (unique(attachment_id) doesn't block a second FILE)...");
      const aliceAttachment2 = psqlAsAlice(`
        insert into core.attachments (business_id, entity_type, entity_id, storage_path, file_name, content_type, size_bytes)
        values ('${aliceBusiness}', 'gst_business', '${aliceBusiness}', '${aliceBusiness}/other-id/challan.pdf', 'challan.pdf', 'application/pdf', 512)
        returning id;
      `);
      psqlAsAlice(insertEvidence(aliceBusiness, aliceAttachment2, "payment_challan"));

      console.log("The SAME attachment cannot be recorded as evidence twice (unique(attachment_id))...");
      assertThrows(() => psqlAsAlice(insertEvidence(aliceBusiness, aliceAttachment, "other")), "unique(attachment_id)");

      console.log("related_entity_type and related_entity_id must be supplied together, not just one (check constraint)...");
      assertThrows(
        () =>
          psqlAsAlice(`
            insert into gst.compliance_evidence (business_id, attachment_id, evidence_type, related_entity_type)
            values ('${aliceBusiness}', '${aliceAttachment2}', 'other', 'return_period')
          `),
        "related-entity both-or-neither check constraint",
      );

      console.log("THE CROSS-REFERENCE GUARD: Alice (licensed on her own business) cannot record evidence whose business_id is hers but whose attachment_id belongs to Bob's business...");
      assertThrows(
        () => psqlAsAlice(insertEvidence(aliceBusiness, bobAttachment, "other")),
        "attachment_id does not belong to business_id -- cross-tenant reference rejected",
      );

      console.log("...and Bob can still record his own evidence right after, proving the guard doesn't over-block...");
      psqlAsBob(insertEvidence(bobBusiness, bobAttachment, "other"));

      console.log("Tenant isolation: Bob cannot read Alice's evidence...");
      assertEqual(psqlAsBob(`select count(*)::int from gst.compliance_evidence where business_id = '${aliceBusiness}'`), "0", "Bob's RLS-scoped read of Alice's business returns nothing");

      console.log("Carol (viewer) CAN read Alice's evidence (read is open to any licensed business member)...");
      assertEqual(psqlAsCarol(`select count(*)::int from gst.compliance_evidence where business_id = '${aliceBusiness}'`), "2", "Carol can see both of Alice's evidence rows");

      console.log("Nobody, not even the owner, can update an evidence row (no UPDATE policy)...");
      assertThrows(() => psqlAsAlice(`update gst.compliance_evidence set description = 'x' where id = '${evidence1}'`), "no UPDATE policy exists");

      console.log("Nobody can delete one either (no DELETE policy -- permanent compliance history)...");
      assertThrows(() => psqlAsAlice(`delete from gst.compliance_evidence where id = '${evidence1}'`), "no DELETE policy exists");

      console.log("All gst.compliance_evidence RLS assertions passed.");
    },
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
