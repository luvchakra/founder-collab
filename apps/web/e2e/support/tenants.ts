import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

/**
 * Deterministic two-tenant fixtures for the security / multi-user E2E suite
 * (docs/testing/E2E_TEST_PLAN.md). Everything this file creates is named with the
 * `e2e-qa` prefix and lives in its own accounts, so it can be torn down without ever
 * touching (or even listing) any real account on the target project:
 *
 *   Tenant A  "Acme Home Security QA"   all five modules licensed
 *     ownerA      owner
 *     adminA      admin
 *     viewerA     viewer            (read-only system role)
 *     invMgrA     inventory_manager (module-scoped system role)
 *   Tenant A2 "e2e-qa Discovery Only"  same account as A, ONLY discovery licensed
 *   Tenant B  "e2e-qa Tenant B"        all five modules licensed, separate account
 *     ownerB      owner
 *   outsider    signed up, belongs to no business at all
 *
 * Users are created with the service-role admin API (email pre-confirmed -- no mail is
 * sent); businesses, memberships and tenant B's records are created through each user's
 * OWN RLS-scoped session, exactly the write path the app uses, so a fixture that seeds
 * successfully is itself evidence the normal path works. Licenses are activated with the
 * service role, mirroring core/licensing/lifecycle.ts#activateLicense (licensing is a
 * billing-side write no tenant user may perform).
 *
 * Never point this at production: it refuses to run unless E2E_ALLOW_FIXTURES=1.
 */

export const QA_PREFIX = "e2e-qa";
const EMAIL_DOMAIN = "e2e.wonderark.test";
export const STATE_FILE = "playwright/.auth/tenants.json";

export type QaUserKey = "ownerA" | "adminA" | "viewerA" | "invMgrA" | "ownerB" | "outsider";
export type QaBusinessKey = "A" | "A2" | "B";

export type QaTenants = {
  password: string;
  users: Record<QaUserKey, { id: string; email: string }>;
  businesses: Record<QaBusinessKey, { id: string; slug: string; accountId: string; name: string }>;
  /** Records owned by tenant B -- the targets of every cross-tenant attempt. */
  b: { partyId: string; itemId: string; documentId: string; productId: string; workspaceId: string; prospectId: string; jobId: string };
  /** A record owned by tenant A, for same-tenant RBAC write attempts. */
  a: { partyId: string; productId: string };
};

const ALL_MODULES = ["discovery", "inventory", "fsm", "crm", "gst"] as const;

function env(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} must be set (apps/web/.env.local) for the E2E fixtures.`);
  return value;
}

export function adminClient(schema = "core"): SupabaseClient {
  return createClient(env("NEXT_PUBLIC_SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { autoRefreshToken: false, persistSession: false },
    db: { schema },
  }) as SupabaseClient;
}

/** A client signed in as `email` -- every request it makes carries that user's JWT, so
 * PostgREST applies RLS exactly as it does for a browser session. */
export async function userClient(email: string, password: string): Promise<{ client: SupabaseClient; accessToken: string }> {
  const client = createClient(env("NEXT_PUBLIC_SUPABASE_URL"), env("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !data.session) throw new Error(`Fixture sign-in failed for ${email}: ${error?.message}`);
  return { client, accessToken: data.session.access_token };
}

export function anonClient(): SupabaseClient {
  return createClient(env("NEXT_PUBLIC_SUPABASE_URL"), env("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/** The one row a fixture step must produce. Fixtures only ever read ids/slugs back. */
function must(result: { data: unknown; error: { message: string } | null }, what: string): Record<string, string> {
  if (result.error || result.data === null || result.data === undefined) throw new Error(`Fixture step failed (${what}): ${result.error?.message ?? "no data"}`);
  return result.data as Record<string, string>;
}

/** Removes every fixture account this suite has ever created on the project. Found by
 * account name prefix (core.handle_new_user names the account after the user's
 * full_name), so no real user's email is ever read. Deleting the account cascades to
 * its businesses and every business-scoped row; deleting the auth user removes the rest. */
export async function teardownTenants(): Promise<void> {
  const core = adminClient("core");
  const { data: accounts, error } = await core.from("accounts").select("id").like("name", `${QA_PREFIX}-%`);
  if (error) throw new Error(`Fixture teardown lookup failed: ${error.message}`);
  const accountIds = (accounts ?? []).map((a) => a.id as string);
  if (accountIds.length === 0) return;

  const { data: members } = await core.from("account_members").select("user_id").in("account_id", accountIds);
  const userIds = [...new Set((members ?? []).map((m) => m.user_id as string))];

  const { error: deleteError } = await core.from("accounts").delete().in("id", accountIds);
  if (deleteError) throw new Error(`Fixture teardown (accounts) failed: ${deleteError.message}`);

  const auth = adminClient().auth.admin;
  for (const id of userIds) {
    const { error: userError } = await auth.deleteUser(id);
    if (userError && !/not found/i.test(userError.message)) throw new Error(`Fixture teardown (user) failed: ${userError.message}`);
  }
}

async function createQaUser(key: QaUserKey, password: string): Promise<{ id: string; email: string }> {
  const email = `${QA_PREFIX}-${key.toLowerCase()}@${EMAIL_DOMAIN}`;
  const { data, error } = await adminClient().auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: `${QA_PREFIX}-${key}` },
  });
  if (error || !data.user) throw new Error(`Fixture user ${key} failed: ${error?.message}`);
  return { id: data.user.id, email };
}

async function activateLicense(businessId: string, accountId: string, moduleKey: string): Promise<void> {
  const core = adminClient("core");
  const license = must(
    await core.from("licenses").upsert({ business_id: businessId, account_id: accountId, module_key: moduleKey, status: "active" }, { onConflict: "business_id,module_key" }).select("id").single(),
    `license ${moduleKey}`,
  );
  await core.from("license_events").insert({ license_id: license.id, business_id: businessId, module_key: moduleKey, event_type: "activated" });
}

async function accountIdFor(client: SupabaseClient, userId: string): Promise<string> {
  const row = must(await client.schema("core").from("account_members").select("account_id").eq("user_id", userId).single(), "account lookup");
  return row.account_id as string;
}

/** Creates a business the way dashboard/actions.ts#createBusinessAction does: insert as
 * the signed-in user (RLS checks account membership), then the creator's owner row. */
async function createBusinessAs(client: SupabaseClient, userId: string, accountId: string, name: string, modules: readonly string[]) {
  const business = must(await client.schema("core").from("businesses").insert({ account_id: accountId, name }).select("id").single(), `business ${name}`);
  must(await client.schema("core").from("business_members").insert({ business_id: business.id, user_id: userId, role: "owner" }).select("id").single(), `owner of ${name}`);
  for (const key of modules) await activateLicense(business.id, accountId, key);
  const settings = must(await adminClient("core").from("business_settings").select("slug").eq("business_id", business.id).single(), `slug of ${name}`);
  return { id: business.id as string, slug: settings.slug as string, accountId, name };
}

export async function seedTenants(): Promise<QaTenants> {
  if (process.env.E2E_ALLOW_FIXTURES !== "1") {
    throw new Error("Refusing to seed: set E2E_ALLOW_FIXTURES=1 to confirm the target project is a dev/test project, never production.");
  }
  await teardownTenants(); // idempotent: a previous interrupted run never leaks into this one

  const password = `Qa-${randomBytes(12).toString("hex")}!`;
  const keys: QaUserKey[] = ["ownerA", "adminA", "viewerA", "invMgrA", "ownerB", "outsider"];
  const users = {} as QaTenants["users"];
  for (const key of keys) users[key] = await createQaUser(key, password);

  const { client: a } = await userClient(users.ownerA.email, password);
  const { client: b } = await userClient(users.ownerB.email, password);
  const accountA = await accountIdFor(a, users.ownerA.id);
  const accountB = await accountIdFor(b, users.ownerB.id);

  const businesses = {
    A: await createBusinessAs(a, users.ownerA.id, accountA, "Acme Home Security QA", ALL_MODULES),
    A2: await createBusinessAs(a, users.ownerA.id, accountA, `${QA_PREFIX} Discovery Only`, ["discovery"]),
    B: await createBusinessAs(b, users.ownerB.id, accountB, `${QA_PREFIX} Tenant B`, ALL_MODULES),
  };

  // Tenant A's additional members, each on a different system role. Inserted with the
  // service role: RLS deliberately refuses even the owner a direct insert of somebody
  // else's membership (it only arrives through invitation acceptance), which the
  // security suite asserts separately.
  for (const [key, role] of [["adminA", "admin"], ["viewerA", "viewer"], ["invMgrA", "inventory_manager"]] as const) {
    must(
      await adminClient("core").from("business_members").insert({ business_id: businesses.A.id, user_id: users[key].id, role }).select("id").single(),
      `member ${key}`,
    );
  }

  // Tenant B's records -- created by ownerB through RLS.
  const bCore = b.schema("core");
  const party = must(await bCore.from("parties").insert({ business_id: businesses.B.id, name: `${QA_PREFIX} B Customer <script>x</script>` }).select("id").single(), "B party");
  await bCore.from("party_roles").insert({ business_id: businesses.B.id, party_id: party.id, role: "customer" });
  const item = must(await bCore.from("items").insert({ business_id: businesses.B.id, name: `${QA_PREFIX} B Item` }).select("id").single(), "B item");
  const document = must(
    await bCore.from("documents").insert({ business_id: businesses.B.id, doc_type: "invoice", source_module: "fsm", party_id: party.id, status: "draft" }).select("id").single(),
    "B document",
  );
  const product = must(await b.schema("discovery").from("products").insert({ business_id: businesses.B.id, name: `${QA_PREFIX} B Offering` }).select("id").single(), "B product");
  const workspace = must(await b.schema("discovery").from("workspaces").select("id").eq("product_id", product.id).maybeSingle(), "B workspace (auto-created with product)");
  const prospect = must(
    await b.schema("discovery").from("prospects").insert({ workspace_id: workspace.id, company_name: `${QA_PREFIX} B Prospect` }).select("id").single(),
    "B prospect",
  );
  const job = must(await b.schema("fsm").from("jobs").insert({ business_id: businesses.B.id, party_id: party.id, description: `${QA_PREFIX} B Job` }).select("id").single(), "B job");

  const aParty = must(await a.schema("core").from("parties").insert({ business_id: businesses.A.id, name: `${QA_PREFIX} A Customer` }).select("id").single(), "A party");
  const aProduct = must(await a.schema("discovery").from("products").insert({ business_id: businesses.A.id, name: `${QA_PREFIX} A Offering` }).select("id").single(), "A product");
  // One Service job so list pages have a row to render as a table (desktop) / card (mobile).
  must(await a.schema("fsm").from("jobs").insert({ business_id: businesses.A.id, party_id: aParty.id, description: `${QA_PREFIX} A Job` }).select("id").single(), "A job");

  const state: QaTenants = {
    password,
    users,
    businesses,
    b: { partyId: party.id, itemId: item.id, documentId: document.id, productId: product.id, workspaceId: workspace.id, prospectId: prospect.id, jobId: job.id },
    a: { partyId: aParty.id, productId: aProduct.id },
  };
  mkdirSync(dirname(STATE_FILE), { recursive: true });
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), { mode: 0o600 });
  return state;
}

/** The state the setup project wrote -- every security spec reads this rather than
 * re-seeding, so the whole run shares one consistent pair of tenants. */
export function loadTenants(): QaTenants {
  if (!existsSync(STATE_FILE)) throw new Error(`${STATE_FILE} missing -- the "tenants" setup project must run first.`);
  return JSON.parse(readFileSync(STATE_FILE, "utf8")) as QaTenants;
}
