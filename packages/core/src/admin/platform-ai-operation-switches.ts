import { z } from "zod";
import { createClient } from "../db/server";
import { requireSuperadmin } from "../rbac/platform-admin";
import { listAiOperations, type AiOperation } from "../ai/operation-registry";

/**
 * PLATFORM-P0-10.4 ("AI Feature Kill Switch", §14) -- the admin side of
 * `platform.ai_operation_switches`. One row per AI feature in the operation registry; a
 * feature with no stored switch is enabled. Writes go through
 * `platform.set_ai_operation_enabled()`, which re-checks superadmin, requires a reason and
 * writes platform.audit_log itself. The runtime check lives in `ai/feature-kill-switch.ts`.
 */

export type AiOperationSwitch = {
  operation: AiOperation;
  label: string;
  enabled: boolean;
  reason: string | null;
  updatedAt: string | null;
};

/** "draft_review_response" -> "Draft review response". */
export function aiOperationLabel(operation: string): string {
  const words = operation.replace(/_/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export async function listAiOperationSwitches(): Promise<AiOperationSwitch[]> {
  await requireSuperadmin();
  const supabase = await createClient({ schema: "platform" });
  const { data, error } = await supabase.from("ai_operation_switches").select("operation, enabled, reason, updated_at");
  if (error) throw error;
  const byOperation = new Map(((data ?? []) as { operation: string; enabled: boolean; reason: string; updated_at: string }[]).map((r) => [r.operation, r]));
  return listAiOperations().map((operation) => {
    const row = byOperation.get(operation);
    return {
      operation,
      label: aiOperationLabel(operation),
      enabled: row ? row.enabled : true,
      reason: row?.reason ?? null,
      updatedAt: row?.updated_at ?? null,
    };
  });
}

const setSchema = z.object({
  operation: z.string().refine((v) => (listAiOperations() as string[]).includes(v), "Unknown AI feature."),
  enabled: z.boolean(),
  reason: z.string().trim().min(1, "A reason is required.").max(500),
});

export async function setAiOperationEnabled(input: z.input<typeof setSchema>): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireSuperadmin();
  const parsed = setSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  const supabase = await createClient({ schema: "platform" });
  const { error } = await supabase.rpc("set_ai_operation_enabled", {
    p_operation: parsed.data.operation,
    p_enabled: parsed.data.enabled,
    p_reason: parsed.data.reason,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
