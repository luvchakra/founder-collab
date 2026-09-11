import { createClient as createCoreClient } from "@cofounderai/core/db/server";
import type { PartyAddress, PartyTaxContext, PartyTaxIdentity } from "./types";

/**
 * COMPLY-P0-03.4 (Party Tax Context): "Use Core party address/tax-registration data."
 *
 * **Checked the entity-ownership map and existing schema before deciding how to read
 * this** (backlog rule 1 / CLAUDE.md non-negotiable #5): `core.tax_identities` (a
 * *party's* GSTIN/state/registration type, keyed by `party_id`) and `core.addresses`
 * (billing/shipping/service, keyed by `party_id`) both already exist
 * (`supabase/migrations/20260906101000_core_addresses_tax_identities.sql`, Epic 3
 * story D-2) and are exactly the "party address/tax-registration data" this story's own
 * title names -- no new table, no duplicate master (backlog rule 3 / §5's own "never
 * duplicate transaction masters"). Per CLAUDE.md's ranked cross-module mechanisms, this
 * is mechanism (1) -- "read shared data from `core` directly -- no coupling" -- the same
 * situation as COMPLY-P0-03.1/03.2, not a `contract/index.ts` call (`core` data belongs
 * to no single sibling module) and not a new `gst`-schema table.
 *
 * **Distinct from `gst.tax_registrations` (COMPLY-P0-02.1)**: that table is the FILING
 * BUSINESS's own registrations (its own GSTINs, plural, versioned, multi-country/regime).
 * `core.tax_identities` here is the opposite direction -- a *customer or supplier's* own
 * GSTIN, read to determine whether a supply to/from that party is intra-state
 * (CGST+SGST) or inter-state (IGST), and whether that party is itself GST-registered at
 * all. Neither table is a copy of the other; both are read, for different purposes, by
 * the same future GST tax-determination logic (COMPLY-P0-04.4/04.5).
 *
 * Reads only, no migration, no new RLS surface -- `core.tax_identities`/`core.addresses`
 * already enforce tenant isolation via their own existing RLS
 * (`business_id in core.user_business_ids()`) and are not gated by `gst` licensing at all
 * (a party's own address/tax data exists regardless of which modules a business has
 * licensed, same as `core.items` in COMPLY-P0-03.2) -- so, matching every other read-only
 * query file in this module, there is no `requireModule`/`requirePermission` call here.
 */

function coreClient() {
  return createCoreClient({ schema: "core" });
}

export function mapPartyTaxIdentity(row: {
  party_id: string;
  gstin: string | null;
  state: string | null;
  gst_registration_type: string;
}): PartyTaxIdentity {
  return {
    partyId: row.party_id,
    gstin: row.gstin,
    state: row.state,
    gstRegistrationType: row.gst_registration_type as PartyTaxIdentity["gstRegistrationType"],
  };
}

export function mapPartyAddress(row: {
  id: string;
  kind: string;
  is_primary: boolean;
  formatted: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  country: string | null;
}): PartyAddress {
  return {
    id: row.id,
    kind: row.kind as PartyAddress["kind"],
    isPrimary: row.is_primary,
    formatted: row.formatted,
    city: row.city,
    state: row.state,
    postalCode: row.postal_code,
    country: row.country,
  };
}

/** Of a list of addresses, the primary one of `kind` if marked, else the first address
 * of that `kind` found (`core.addresses`' own unique index guarantees at most one
 * `is_primary` per `party_id, kind`, but a party can have several non-primary addresses
 * of the same kind with none marked primary -- pick a deterministic one rather than
 * returning nothing). `null` when the party has no address of that `kind` at all.
 * Exported as a pure function so this selection logic is unit-testable without a live
 * database connection, matching this module's own established convention (e.g.
 * `mapItemTaxContext` in COMPLY-P0-03.2). */
export function selectPartyAddress(addresses: PartyAddress[], kind: PartyAddress["kind"]): PartyAddress | null {
  const ofKind = addresses.filter((a) => a.kind === kind);
  return ofKind.find((a) => a.isPrimary) ?? ofKind[0] ?? null;
}

/** A party's own GST registration (GSTIN/state/regular-composition-unregistered), or
 * `null` if no `core.tax_identities` row exists for this party yet -- most parties never
 * get one; a row is created only when a business actually records a customer/supplier's
 * GSTIN (e.g. via the existing GST profile / customer form). Absence is NOT the same as
 * "unregistered": it means the platform simply has no data on file, so callers (future
 * COMPLY-P0-04.4/04.5 place-of-supply and tax determination) must treat `null` as
 * "unknown, ask for or require input" rather than defaulting to any particular
 * treatment -- backlog rule 11's "never claim compliant from a calculation alone" applies
 * equally to never silently assuming a party's registration status. */
export async function getPartyTaxIdentity(businessId: string, partyId: string): Promise<PartyTaxIdentity | null> {
  const core = await coreClient();
  const { data, error } = await core
    .from("tax_identities")
    .select("party_id, gstin, state, gst_registration_type")
    .eq("business_id", businessId)
    .eq("party_id", partyId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return mapPartyTaxIdentity(data);
}

/** Every address on file for a party (billing/shipping/service), primary-first within
 * each kind. */
export async function listPartyAddresses(businessId: string, partyId: string): Promise<PartyAddress[]> {
  const core = await coreClient();
  const { data, error } = await core
    .from("addresses")
    .select("id, kind, is_primary, formatted, city, state, postal_code, country")
    .eq("business_id", businessId)
    .eq("party_id", partyId)
    .order("kind")
    .order("is_primary", { ascending: false });
  if (error) throw error;
  return data.map(mapPartyAddress);
}

/** The combined read this story exists to serve: a party's tax identity plus its
 * primary billing and shipping addresses -- the exact inputs place-of-supply (does the
 * ship-to state match the supplying business's own registered state?) and CGST/SGST-vs-
 * IGST determination need. Service addresses remain available via `listPartyAddresses`
 * directly -- this combined read only surfaces billing/shipping, since those are the
 * generic, cross-regime concepts; FSM's own "service location" is `fsm`-schema data
 * (module-fsm's own job to read from its own domain, not duplicated here). */
export async function getPartyTaxContext(businessId: string, partyId: string): Promise<PartyTaxContext> {
  const [taxIdentity, addresses] = await Promise.all([
    getPartyTaxIdentity(businessId, partyId),
    listPartyAddresses(businessId, partyId),
  ]);
  return {
    partyId,
    taxIdentity,
    billingAddress: selectPartyAddress(addresses, "billing"),
    shippingAddress: selectPartyAddress(addresses, "shipping"),
  };
}
