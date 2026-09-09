/** Same result shape as every other module's `contract/index.ts` (ADR-10) -- a caller
 * not licensed for `crm` gets `{ ok: false, error: "MODULE_NOT_LICENSED" }` back as a
 * normal value, not an exception. */
export type ContractResult<T> = { ok: true; data: T } | { ok: false; error: "MODULE_NOT_LICENSED" | "NOT_FOUND" | string };
