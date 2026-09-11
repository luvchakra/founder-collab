import type { OfferingType, Product } from "../tenancy/types";

export type { OfferingType };

/**
 * DISC-OFFER-P0-01.1: "Business Offering" is the new primary-vocabulary name for the
 * same `discovery.products` row -- not a second entity. Existing code keeps importing
 * `Product` from `../tenancy/types` unchanged (DISC-OFFER-P0-01.2's own "existing
 * workflows continue to work during transition"); new offering-centric code imports
 * `Offering` from here instead. `shortDescription` aliases the existing `description`
 * column rather than duplicating it in storage -- the same text, read under the name
 * this backlog's own field list uses.
 */
export type Offering = Product;

export const OFFERING_TYPE_LABEL: Record<OfferingType, string> = {
  product: "Product",
  service: "Service",
  subscription: "Subscription",
  consulting: "Consulting",
  professional_service: "Professional Service",
  maintenance: "Maintenance",
  training: "Training",
  package: "Package",
  solution: "Solution",
  other: "Other",
};

/** DISC-OFFER-P0-01.1: "Offerings support active/inactive/archive." */
export type OfferingStatus = Offering["status"];

export const OFFERING_STATUS_LABEL: Record<OfferingStatus, string> = {
  active: "Active",
  inactive: "Inactive",
  archived: "Archived",
};

export function shortDescription(offering: Offering): string | null {
  return offering.description;
}
