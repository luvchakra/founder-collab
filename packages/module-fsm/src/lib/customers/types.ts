/** PRD §5, `/fsm/customers`: "Parties with `customer` role (shared list with inventory
 * when both licensed -- same data, module-appropriate columns)." Deliberately not a
 * fsm-local copy -- reads `core.parties`/`core.party_roles` directly (mechanism 1,
 * 00-MASTER-PLAN.md §6), the same rows `inventory.customers`'s own compat view reads
 * through a different name, so a customer created from either module's side shows up
 * in both without any sync step. */
export interface FsmCustomer {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  is_active: boolean;
  created_at: string;
  open_job_count: number;
  open_opportunity_count: number;
}
