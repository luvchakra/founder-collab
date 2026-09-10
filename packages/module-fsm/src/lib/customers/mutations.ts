import { requireModule } from "@cofounderai/core/licensing/queries";
import { requirePermission } from "@cofounderai/core/rbac/require-permission";
import { updateParty } from "@cofounderai/core/parties/mutations";

/** Edits the underlying `core.parties` row directly (mechanism 1, 00-MASTER-PLAN.md §6)
 * -- the same row inventory's own customer screen edits through its `customers` compat
 * view. Reuses `customers.edit` (core_permissions migration) rather than inventing an
 * fsm-specific key: `core.has_permission()` checks it purely against the caller's role
 * grant, with no module-licensing join, so granting it doesn't require Inventory to be
 * licensed on this business -- see that migration's own `role_permissions` seed (assigned
 * to `sales_manager`/`accountant`, both business-wide roles, not inventory-specific
 * ones). Keeps this screen's own doc'd "read-only, editing is inventory's job" stance
 * true only when inventory *is* licensed too; an FSM-only business now has its own way to
 * fix a customer's email/phone without a hard cross-module dependency (ADR-10). */
export async function updateFsmCustomer(
  businessId: string,
  partyId: string,
  patch: { name?: string; email?: string | null; phone?: string | null },
): Promise<void> {
  await requireModule(businessId, "fsm");
  await requirePermission(businessId, "customers.edit");
  await updateParty(businessId, partyId, patch);
}
