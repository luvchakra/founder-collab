import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "../../db/server";
import { createClient as createCoreClient } from "@cofounderai/core/db/server";
import { createAdminClient as createCoreAdminClient } from "@cofounderai/core/db/admin";
import type { Account, Business, Product, Workspace } from "./types";

/** accounts/businesses live in the `core` schema (Epic 2's C-1) -- every module shares
 * them, so they're never queried through discovery's own schema-scoped client. */
function coreClient() {
  return createCoreClient({ schema: "core" });
}

/**
 * Tenancy read layer. Every function runs the request as the authenticated user through
 * the RLS-scoped Supabase server client (never the service-role/admin client) -- Row
 * Level Security (supabase/migrations/*_tenancy_schema.sql) is the source of truth for
 * what a caller can see, not this code. A query for an id the caller doesn't own returns
 * zero rows, never another tenant's data and never a distinguishable error -- that's what
 * "never rely on frontend filtering" means in practice here.
 *
 * Every function is wrapped in React's `cache()`: the dashboard layout and the page
 * rendered inside it (and nested product layouts/pages below that) independently call
 * several of these with the same arguments on every navigation. Without memoization each
 * of those re-runs its own Supabase round trip; `cache()` dedupes identical calls to one
 * DB query per request, matching Next.js's own request-memoization model for `fetch()`.
 */

export const requireUser = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated.");
  return user;
});

/** MVP assumes one account per user (see blueprint §9); returns the first membership. */
export const getCurrentAccount = cache(async (): Promise<Account | null> => {
  const supabase = await coreClient();
  const { data, error } = await supabase
    .from("accounts")
    .select("*")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
});

export const listBusinesses = cache(async (accountId: string): Promise<Business[]> => {
  const supabase = await coreClient();
  const { data, error } = await supabase
    .from("businesses")
    .select("*")
    .eq("account_id", accountId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data;
});

export const getBusiness = cache(async (
  businessId: string,
  client?: SupabaseClient,
): Promise<Business | null> => {
  const supabase = client ?? (await coreClient());
  const { data, error } = await supabase
    .from("businesses")
    .select("*")
    .eq("id", businessId)
    .maybeSingle();
  if (error) throw error;
  return data;
});

export const listProducts = cache(async (businessId: string): Promise<Product[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("products")
    .select("*")
    .eq("business_id", businessId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data;
});

export const getProduct = cache(async (
  productId: string,
  client?: SupabaseClient,
): Promise<Product | null> => {
  const supabase = client ?? (await createClient());
  const { data, error } = await supabase
    .from("products")
    .select("*")
    .eq("id", productId)
    .maybeSingle();
  if (error) throw error;
  return data;
});

/** Every product has exactly one workspace in the MVP (auto-created by the DB trigger). */
export const getWorkspaceForProduct = cache(async (
  productId: string,
): Promise<Workspace | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("workspaces")
    .select("*")
    .eq("product_id", productId)
    .maybeSingle();
  if (error) throw error;
  return data;
});

/** Batched getWorkspaceForProduct -- one query for every product's workspace instead of
 * one query per product. The dashboard (resolving every product on the account to its
 * workspace) is the reason this exists. */
export async function listWorkspacesForProducts(productIds: string[]): Promise<Workspace[]> {
  if (productIds.length === 0) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("workspaces")
    .select("*")
    .in("product_id", productIds);
  if (error) throw error;
  return data;
}

export const getWorkspace = cache(async (
  workspaceId: string,
  client?: SupabaseClient,
): Promise<Workspace | null> => {
  const supabase = client ?? (await createClient());
  const { data, error } = await supabase
    .from("workspaces")
    .select("*")
    .eq("id", workspaceId)
    .maybeSingle();
  if (error) throw error;
  return data;
});

/**
 * workspace -> product -> business -> account_id. Three sequential queries rather than a
 * nested PostgREST embed, matching this file's existing style. Used by the BYOK AI router
 * (lib/ai/router.ts) to find which account's provider credential should serve a
 * workspace-scoped AI operation.
 *
 * Pass `client` (the admin client) for callers with no logged-in user, e.g.
 * classifyReply's usage from the inbound email webhook -- without it, the RLS-scoped
 * client would see zero rows for a request that has no authenticated session.
 */
/**
 * First workspace found under an account (earliest-created business, earliest-created
 * product) -- resolves the account's AI provider credential for account-wide features
 * that aren't scoped to one workspace, like the header chat assistant, without a new
 * account-scoped credential lookup: any workspace under the account already leads to the
 * same account_id, and ai_runs/usage limits need some workspace to attribute the run to.
 */
export async function getFirstWorkspaceForAccount(accountId: string): Promise<Workspace | null> {
  const businesses = await listBusinesses(accountId);
  for (const business of businesses) {
    const workspace = await getFirstWorkspaceForBusiness(business.id);
    if (workspace) return workspace;
  }
  return null;
}

/**
 * Same idea as getFirstWorkspaceForAccount, one level down: earliest-created product
 * under a specific business. The header chat assistant needs this for a business-only
 * page (no product selected yet) -- falling back to getFirstWorkspaceForAccount there
 * would attribute the conversation to the account's first business's workspace, which
 * could be a completely different business than the one actually being viewed.
 */
export async function getFirstWorkspaceForBusiness(businessId: string): Promise<Workspace | null> {
  const products = await listProducts(businessId);
  for (const product of products) {
    const workspace = await getWorkspaceForProduct(product.id);
    if (workspace) return workspace;
  }
  return null;
}

export async function getAccountIdForWorkspace(
  workspaceId: string,
  client?: SupabaseClient,
): Promise<string | null> {
  const workspace = await getWorkspace(workspaceId, client);
  if (!workspace) return null;

  const product = await getProduct(workspace.product_id, client);
  if (!product) return null;

  // `client`, when passed, is a discovery-schema admin client (the no-session webhook
  // path) -- businesses live in `core` now, so the business lookup needs its own
  // core-schema admin client rather than the one threaded through for workspace/product.
  const business = await getBusiness(
    product.business_id,
    client ? createCoreAdminClient({ schema: "core" }) : undefined,
  );
  if (!business) return null;

  return business.account_id;
}

/** business_id (not account_id) for a workspace -- core.parties/party_roles (D-1/D-3) are
 * scoped by business_id, not account_id, since a business's customer ledger is shared
 * across every product/workspace it markets (ADR-4). */
export async function getBusinessIdForWorkspace(
  workspaceId: string,
  client?: SupabaseClient,
): Promise<string | null> {
  const workspace = await getWorkspace(workspaceId, client);
  if (!workspace) return null;

  const product = await getProduct(workspace.product_id, client);
  if (!product) return null;

  return product.business_id;
}
