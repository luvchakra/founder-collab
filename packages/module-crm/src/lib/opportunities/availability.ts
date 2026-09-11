import { getAvailability } from "@cofounderai/module-inventory/contract/index";
import type { OpportunityProduct } from "./products";

export type FulfillmentAvailabilityStatus = "available" | "backordered" | "unavailable";

export const FULFILLMENT_AVAILABILITY_LABEL: Record<FulfillmentAvailabilityStatus, string> = {
  available: "Available now",
  backordered: "Backordered",
  unavailable: "Unavailable",
};

export type LineAvailability = {
  /** `crm.product_interest.id` -- the row `updateOpportunityProductQuantity()` edits. */
  productInterestId: string;
  itemId: string;
  itemName: string;
  requestedQuantity: number;
  availableQuantity: number;
  status: FulfillmentAvailabilityStatus;
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
      return { productInterestId: product.id, itemId: product.itemId, itemName: product.itemName, requestedQuantity, availableQuantity, status };
    }),
  );
  return { allAvailable: lines.every((line) => line.status === "available"), lines };
}
