/**
 * COMPLY-P0-03.3 (FSM Tax Context): "Read service-billing context from FSM." See
 * `queries.ts`'s own docstring for the real scope boundary this story hit and why it is
 * only PARTIALLY implemented this run.
 */

/** The FSM job that produced a `core.documents` row, when that document was sourced
 * from FSM (`source_module = 'fsm'`) -- `fsm.invoices/mutations.ts` writes
 * `source_ref: { job_id: <uuid> }` on the invoice it creates from a job. This is as much
 * "service-billing context" as this story can read without a new `module-fsm` contract
 * export -- see `queries.ts`. */
export type FsmJobReference = {
  jobId: string;
};
