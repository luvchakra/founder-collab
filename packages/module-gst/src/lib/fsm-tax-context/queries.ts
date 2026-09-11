import { createClient as createCoreClient } from "@cofounderai/core/db/server";
import type { FsmJobReference } from "./types";

/**
 * COMPLY-P0-03.3 (FSM Tax Context): "Read service-billing context from FSM."
 *
 * **Scope boundary hit and documented here, not worked around**: unlike COMPLY-P0-03.1
 * (Core) and COMPLY-P0-03.2 (Inventory, which turned out to also be `core`-owned data),
 * `fsm.jobs`/`fsm.service_types` ARE genuinely `fsm`-schema-owned -- a real sibling
 * licensed module, not `core`. CLAUDE.md's cross-module communication rule ranks reading
 * such data as mechanism (2): "call another module's `contract/index.ts` function" --
 * `@cofounderai/module-fsm/contract/index.ts` is the ONLY thing this module may import
 * from `module-fsm` (CLAUDE.md non-negotiable #3, CI-enforced by `lint:boundaries`).
 *
 * Checked that contract's own current exports (`listRecentJobsForParty`,
 * `getFsmQuoteStatus`, `getAssessmentStatus`, ...) for anything that already answers "what
 * service-billing context (service type, job status, service address) applies to job ID
 * X" -- none do; the closest, `listRecentJobsForParty`, is keyed by `partyId` and returns
 * no `service_type`/`service_address` at all. Delivering the fuller version of this story
 * would require a NEW read-only export on `module-fsm`'s own contract (something like
 * `getJobTaxContext(businessId, jobId)`), and this run's own operating instructions
 * restrict all work to `module-gst` and its own routes -- "never touch any other module's
 * package." Rather than reach around that boundary (a raw `schema: "fsm"` client would
 * technically not trip `lint:boundaries`, which only checks TypeScript import statements,
 * but would violate the actual architectural rule in spirit -- `module-fsm`'s own contract
 * file states it is "the ONLY thing other modules may import," and a same-effect
 * workaround that isn't literally an `import` statement is still exactly the thing that
 * rule exists to prevent), this story ships only what's reachable without any change to
 * `module-fsm`: extracting which job produced an FSM-sourced document, which is `core`
 * data (the document's own `source_ref`), not an `fsm`-schema read at all.
 *
 * **Follow-up this leaves for a future story/session** (flagged in the audit log, not
 * silently dropped): add a read-only `getJobTaxContext(businessId, jobId)` -- or similar
 * -- to `@cofounderai/module-fsm/contract/index.ts` (service type name, job status,
 * service address id), then extend this file to call it. That is a `module-fsm` change
 * and is out of scope for this run.
 */

function coreClient() {
  return createCoreClient({ schema: "core" });
}

/**
 * The FSM job that produced `documentId`, if any -- `null` when the document either
 * doesn't exist for this business, wasn't sourced from FSM at all (`source_module !=
 * 'fsm'`), or has no `job_id` in its `source_ref` (an FSM document that isn't
 * job-originated, e.g. a manually created one). Reads `core.documents` directly
 * (COMPLY-P0-03.1's own precedent) -- `source_ref` is `core`-owned jsonb, not an
 * `fsm`-schema read.
 */
export async function getFsmJobReference(businessId: string, documentId: string): Promise<FsmJobReference | null> {
  const core = await coreClient();
  const { data, error } = await core
    .from("documents")
    .select("source_module, source_ref")
    .eq("business_id", businessId)
    .eq("id", documentId)
    .maybeSingle();
  if (error) throw error;
  if (!data || data.source_module !== "fsm") return null;

  const jobId = (data.source_ref as Record<string, unknown> | null)?.job_id;
  if (typeof jobId !== "string" || !jobId) return null;

  return { jobId };
}
