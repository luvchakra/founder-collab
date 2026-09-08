const OPPORTUNITY_STATUS_LABEL: Record<string, string> = {
  new: "New",
  estimate_scheduled: "Estimate scheduled",
  estimate_sent: "Estimate sent",
  won: "Won",
  lost: "Lost",
};

/** F-13's own backlink (PRD §6 point 5): "the prospect page shows opportunity #123 /
 * job #456 / invoice status when FSM is licensed." Takes plain data, not a
 * `@cofounderai/module-fsm` import -- the cross-module contract call itself happens in
 * the page (`apps/web`, exempt from the module-to-module contract-only restriction), so
 * this component (module-discovery's own UI) never imports another module's code, only
 * the plain values it renders. */
export function FsmHandoffPanel({
  status,
}: {
  status: {
    opportunityId: string;
    opportunityStatus: string;
    jobId: string | null;
    jobStatus: string | null;
    invoiceNumber: string | null;
    invoiceStatus: string | null;
    invoiceBalanceAmount: number | null;
  } | null;
}) {
  if (!status) {
    return (
      <div className="rounded-md border bg-muted/40 p-4 text-sm text-muted-foreground">
        Won -- the field service handoff hasn't landed yet (it runs on a schedule and will appear here shortly).
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1 rounded-md border bg-muted/40 p-4 text-sm">
      <p className="font-medium">Field service handoff</p>
      <p>Opportunity: {OPPORTUNITY_STATUS_LABEL[status.opportunityStatus] ?? status.opportunityStatus}</p>
      {status.jobId ? <p>Job: {status.jobStatus ?? "-"}</p> : null}
      {status.invoiceNumber ? (
        <p>
          Invoice {status.invoiceNumber}: {status.invoiceStatus}
          {status.invoiceBalanceAmount !== null && status.invoiceBalanceAmount > 0 ? ` -- balance due ₹${status.invoiceBalanceAmount}` : ""}
        </p>
      ) : null}
    </div>
  );
}
