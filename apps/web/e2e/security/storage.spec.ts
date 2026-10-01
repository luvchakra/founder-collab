import { expect, test } from "@playwright/test";
import { adminClient, anonClient, loadTenants } from "../support/tenants";
import { as } from "./support";

/**
 * Attachments and knowledge files in Supabase Storage (E2E_TEST_PLAN.md §SEC-STO). Both
 * private buckets key every object by its tenant in the first path segment
 * (`<business_id>/...` for attachments, `<workspace_id>/...` for knowledge files); these
 * tests attack exactly that, with real user sessions.
 */

const BODY = new Blob(["e2e-qa confidential tenant B file"], { type: "text/plain" });

test.describe("SEC-STO cross-tenant file access", () => {
  test.describe.configure({ mode: "serial" });

  let bPath = "";
  let bKnowledgePath = "";

  test.beforeAll(async () => {
    const t = loadTenants();
    const b = await as("ownerB");
    bPath = `${t.businesses.B.id}/e2e-qa/${Date.now()}-secret.txt`;
    bKnowledgePath = `${t.b.workspaceId}/e2e-qa-${Date.now()}.txt`;
    const up = await b.storage.from("attachments").upload(bPath, BODY);
    expect(up.error, "owner B can store its own attachment (positive control)").toBeNull();
    const kup = await b.storage.from("knowledge-files").upload(bKnowledgePath, BODY);
    expect(kup.error, "owner B can store its own knowledge file (positive control)").toBeNull();
  });

  test.afterAll(async () => {
    await adminClient().storage.from("attachments").remove([bPath]);
    await adminClient().storage.from("knowledge-files").remove([bKnowledgePath]);
  });

  test("another tenant, a no-business user and anon cannot download, sign or list B's files", async () => {
    const t = loadTenants();
    for (const [who, client] of [
      ["ownerA", await as("ownerA")],
      ["outsider", await as("outsider")],
      ["anon", anonClient()],
    ] as const) {
      const dl = await client.storage.from("attachments").download(bPath);
      expect(dl.data, `${who} download`).toBeNull();
      const signed = await client.storage.from("attachments").createSignedUrl(bPath, 60);
      expect(signed.data?.signedUrl ?? null, `${who} signed URL`).toBeNull();
      const listed = await client.storage.from("attachments").list(t.businesses.B.id);
      expect(listed.data ?? [], `${who} list`).toHaveLength(0);
      const kdl = await client.storage.from("knowledge-files").download(bKnowledgePath);
      expect(kdl.data, `${who} knowledge download`).toBeNull();
    }
  });

  test("another tenant cannot write into, overwrite or delete from B's folder", async () => {
    const t = loadTenants();
    const a = await as("ownerA");
    const planted = await a.storage.from("attachments").upload(`${t.businesses.B.id}/e2e-qa/planted.txt`, BODY);
    expect(planted.error, "upload into B's folder").not.toBeNull();
    const overwrite = await a.storage.from("attachments").upload(bPath, BODY, { upsert: true });
    expect(overwrite.error, "overwrite B's file").not.toBeNull();
    await a.storage.from("attachments").remove([bPath]);
    const still = await adminClient().storage.from("attachments").download(bPath);
    expect(still.data, "B's file survives A's delete attempt").not.toBeNull();
  });

  test("a signed URL is bound to its object and expires", async ({ request }) => {
    const b = await as("ownerB");
    const signed = await b.storage.from("attachments").createSignedUrl(bPath, 2);
    expect(signed.error).toBeNull();
    const url = signed.data!.signedUrl;
    expect((await request.get(url)).status(), "fresh signed URL works").toBe(200);
    // Same token, a different object: refused.
    const swapped = url.replace(/secret\.txt/, "other.txt");
    expect((await request.get(swapped)).status()).toBeGreaterThanOrEqual(400);
    await new Promise((r) => setTimeout(r, 3_500)); // the URL's own 2 s lifetime, by design
    expect((await request.get(url)).status(), "expired signed URL is refused").toBeGreaterThanOrEqual(400);
  });

  test("a path that is not a tenant id is refused, not crashing the policy", async () => {
    const a = await as("ownerA");
    const res = await a.storage.from("attachments").upload(`not-a-uuid/e2e-qa.txt`, BODY);
    expect(res.error).not.toBeNull();
  });

  test("business logos: a tenant can only write into its own folder", async () => {
    const t = loadTenants();
    const a = await as("ownerA");
    const png = new Blob([new Uint8Array([137, 80, 78, 71])], { type: "image/png" });
    const foreign = await a.storage.from("business-logos").upload(`${t.businesses.B.id}/logo-e2e-qa.png`, png);
    expect(foreign.error, "upload into tenant B's logo folder").not.toBeNull();
    const own = await a.storage.from("business-logos").upload(`${t.businesses.A.id}/logo-e2e-qa-${Date.now()}.png`, png);
    expect(own.error, "upload into its own folder (positive control)").toBeNull();
    if (own.data) await adminClient().storage.from("business-logos").remove([own.data.path]);
  });
});
