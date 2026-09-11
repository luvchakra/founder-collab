import { cache } from "react";
import { getProduct, listProducts } from "../tenancy/queries";
import type { Offering } from "./types";

/**
 * DISC-OFFER-P0-01.1's "stable Discovery contract" read layer for Offerings --
 * deliberately thin wrappers over the existing, already-RLS-scoped tenancy queries
 * (`listProducts`/`getProduct`) rather than a second query implementation: this is the
 * exact same `discovery.products` row, read under the new vocabulary new, offering-
 * centric code should use going forward. `cache()`-wrapped for the same request-
 * deduplication reason every other query in this module is.
 */
export const listOfferings = cache(async (businessId: string): Promise<Offering[]> => {
  return listProducts(businessId);
});

export const getOffering = cache(async (offeringId: string): Promise<Offering | null> => {
  return getProduct(offeringId);
});
