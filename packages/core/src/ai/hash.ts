import { createHash } from "node:crypto";

/** Deterministic input hash for ai_runs dedup/audit (blueprint §11). */
export function hashInput(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
