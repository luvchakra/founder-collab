import { cache } from "react";
import { createAdminClient as createCoreAdminClient } from "@cofounderai/core/db/admin";
import { requirePermission } from "@cofounderai/core/rbac/require-permission";
import type { NumberSequenceRow } from "./types";

/** `/fsm/settings`'s own read-only numbering view (F-15) -- `core.number_sequences`
 * (D-4) deliberately has zero client-facing RLS policies (locked in by
 * `scripts/test-core-number-sequences.mjs`'s own "unreadable directly, even by a member
 * of the business it belongs to" assertion, confirmed by reading that test before
 * assuming this was a bug): the only sanctioned access path is
 * `core.next_number()`'s own SECURITY DEFINER RPC. This read therefore goes through the
 * admin client instead, with its own explicit `requirePermission` check taking the
 * place of RLS -- same "privileged path, explicit authorization check in code" pattern
 * `core/db/admin.ts`'s own docstring calls for. Scoped to the numbering scopes FSM's own
 * flows actually mint ('job', 'estimate', 'invoice', 'credit_note'), not every scope any
 * module has ever used for this business. */
const FSM_SCOPES = ["job", "estimate", "invoice", "credit_note"];

export const listFsmNumberSequences = cache(async (businessId: string): Promise<NumberSequenceRow[]> => {
  await requirePermission(businessId, "settings.manage");

  const core = createCoreAdminClient({ schema: "core" });
  const { data, error } = await core
    .from("number_sequences")
    .select("scope, fiscal_year, prefix, next_value")
    .eq("business_id", businessId)
    .in("scope", FSM_SCOPES)
    .order("scope");
  if (error) throw error;
  return data;
});
