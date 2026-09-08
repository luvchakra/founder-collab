// Server actions backing the API Keys panel (business Settings). Generation snapshots
// the CALLING user's role's current permission set onto the new key -- see the
// migration's header comment (20260907210000_core_api_keys.sql) for why a fixed
// snapshot rather than a live pointer to their role.
//
// Runs through the ordinary RLS-scoped client, not the admin one -- the actual
// authorization (only settings.manage holders may create/revoke a key) is enforced by
// core.api_keys/core.api_key_secrets' own RLS policies, not re-implemented here.
import { randomBytes, createHash } from "node:crypto";
import { createClient } from "../../db/server";

function generateRawKey(): string {
  return `sk_live_${randomBytes(24).toString("hex")}`;
}

export async function generateApiKey(businessId: string, name: string): Promise<{ id: string; rawKey: string }> {
  const supabase = await createClient({ schema: "core" });
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");

  const { data: membership } = await supabase
    .from("business_members")
    .select("role")
    .eq("business_id", businessId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!membership) throw new Error("Not a member of this business.");

  const { data: perms, error: permError } = await supabase
    .from("role_permissions")
    .select("permission_key")
    .eq("role", membership.role);
  if (permError) throw new Error(`Could not resolve permissions: ${permError.message}`);

  const rawKey = generateRawKey();
  const keyHash = createHash("sha256").update(rawKey).digest("hex");
  const keyPrefix = rawKey.slice(0, 12);

  const { data: created, error } = await supabase
    .from("api_keys")
    .insert({
      business_id: businessId,
      name,
      key_prefix: keyPrefix,
      permissions: (perms ?? []).map((p) => p.permission_key),
    })
    .select("id")
    .single();
  if (error) throw new Error(`Could not create API key: ${error.message}`);

  const { error: secretError } = await supabase
    .from("api_key_secrets")
    .insert({ api_key_id: created.id, key_hash: keyHash });
  if (secretError) throw new Error(`Could not store API key: ${secretError.message}`);

  // The only time the raw key is ever returned -- the UI must show it once and never
  // again, matching key_hash having no SELECT policy.
  return { id: created.id, rawKey };
}

export async function revokeApiKey(id: string): Promise<void> {
  const supabase = await createClient({ schema: "core" });
  const { error } = await supabase
    .from("api_keys")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(`Could not revoke API key: ${error.message}`);
}
