import { getAvailability, listSubstitutes } from "@cofounderai/module-inventory/contract/index";
import type { ContractSubstitute } from "@cofounderai/module-inventory/contract/types";
import type { OpportunityProduct } from "./products";

export type FulfillmentAvailabilityStatus = "available" | "backordered" | "unavailable";

export const FULFILLMENT_AVAILABILITY_LABEL: Record<FulfillmentAvailabilityStatus, string> = {
  available: "Available now",
  backordered: "Backordered",
  unavailable: "Unavailable",
};

export type LineAvailability = {
  /** `crm.product_interest.id` -- the row `updateOpportunityProductQuantity()` and
   * `substituteOpportunityProduct()` edit. */
  productInterestId: string;
  itemId: string;
  itemName: string;
  requestedQuantity: number;
  availableQuantity: number;
  status: FulfillmentAvailabilityStatus;
  /** INT-05.2's "possible alternatives" -- only populated for a short line (fetching it
   * for a fully-available one would be wasted work); empty when Inventory has nothing
   * in the same category to offer. */
  substitutes: ContractSubstitute[];
};

export type OpportunityAvailabilityCheck = {
  allAvailable: boolean;
  lines: LineAvailability[];
};

/**
 * INT-05.1's "When Inventory reports partial availability" check -- run before a
 * fulfillment request is created so a shortfall becomes an explicit human decision
 * rather than a request that would later fail `inventory.confirm_sales_order()`'s own
 * atomic, all-or-nothing reservation ("Do not silently alter the opportunity"). Each
 * line's available quantity is summed across every warehouse -- CRM has no warehouse
 * concept of its own, the same degradation `createFulfillmentRequest()` already accepts
 * by resolving the first active warehouse itself.
 */
export async function checkOpportunityFulfillmentAvailability(businessId: string, products: OpportunityProduct[]): Promise<OpportunityAvailabilityCheck> {
  const lines = await Promise.all(
    products.map(async (product): Promise<LineAvailability> => {
      const requestedQuantity = product.quantity ?? 1;
      const result = await getAvailability(businessId, product.itemId);
      const availableQuantity = result.ok ? result.data.reduce((sum, level) => sum + Math.max(level.available, 0), 0) : 0;
      const status: FulfillmentAvailabilityStatus = availableQuantity >= requestedQuantity ? "available" : availableQuantity > 0 ? "backordered" : "unavailable";
      const substitutesResult = status !== "available" ? await listSubstitutes(businessId, product.itemId) : null;
      const substitutes = substitutesResult?.ok ? substitutesResult.data : [];
      return { productInterestId: product.id, itemId: product.itemId, itemName: product.itemName, requestedQuantity, availableQuantity, status, substitutes };
    }),
  );
  return { allAvailable: lines.every((line) => line.status === "available"), lines };
}
