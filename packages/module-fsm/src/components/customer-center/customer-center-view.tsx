"use client";

import { useState, useTransition } from "react";
import { Badge } from "@cofounderai/core/ui/badge";
import { Button } from "@cofounderai/core/ui/button";
import { formatDate, inr } from "@cofounderai/core/lib/format";
import type { CustomerCenterView } from "../../lib/customer-center/types";

const STATUS_VARIANT: Record<string, "secondary" | "outline" | "default" | "destructive"> = {
  draft: "secondary",
  sent: "outline",
  viewed: "outline",
  approved: "default",
  declined: "destructive",
  issued: "outline",
  partially_paid: "default",
  paid: "default",
  voided: "destructive",
};

/** `/p/center/[token]`'s content -- no auth, read-only except approve/decline on a still-
 * open estimate (PRD §2 Customer Center row MUST: "my estimates, my invoices, upcoming
 * work, approve estimate, pay/see balance" -- "pay" isn't built, same documented gap as
 * F-8's public invoice page: online payment is a SHOULD/LATER item). */
export function CustomerCenterView({
  view,
  approveEstimateAction,
  declineEstimateAction,
}: {
  view: CustomerCenterView;
  approveEstimateAction: (estimateId: string) => Promise<{ jobId: string }>;
  declineEstimateAction: (estimateId: string) => Promise<void>;
}) {
  const { businessName, businessWebsite, partyName, estimates, invoices, upcoming } = view;
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [resolved, setResolved] = useState<Record<string, "approved" | "declined">>({});

  const run = (estimateId: string, fn: () => Promise<void>) => {
    setError(null);
    startTransition(async () => {
      try {
        await fn();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong.");
      }
    });
  };

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-8 p-6">
      <div>
        <h1 className="text-xl font-semibold">{businessName}</h1>
        {businessWebsite ? <p className="text-sm text-muted-foreground">{businessWebsite}</p> : null}
        <p className="mt-2 text-sm text-muted-foreground">Welcome back, {partyName}.</p>
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase">Upcoming work</h2>
        {upcoming.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing scheduled right now.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {upcoming.map((e) => (
              <div key={e.id} className="rounded-xl border border-border p-4">
                <p className="font-medium">{new Date(e.starts_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</p>
                <p className="text-sm text-muted-foreground">{e.subject_label}</p>
                {e.arrival_window_start && e.arrival_window_end ? (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Arrival window: {new Date(e.arrival_window_start).toLocaleTimeString("en-IN", { timeStyle: "short" })} -{" "}
                    {new Date(e.arrival_window_end).toLocaleTimeString("en-IN", { timeStyle: "short" })}
                  </p>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase">My estimates</h2>
        {estimates.length === 0 ? (
          <p className="text-sm text-muted-foreground">No estimates yet.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {estimates.map((est) => {
              const result = resolved[est.id] ?? (est.status === "approved" ? "approved" : est.status === "declined" ? "declined" : undefined);
              const canRespond = !result && (est.status === "sent" || est.status === "viewed");
              return (
                <div key={est.id} className="flex items-center justify-between rounded-xl border border-border p-4">
                  <div>
                    <p className="font-medium">{est.number ?? "Estimate"}</p>
                    <p className="text-sm text-muted-foreground">
                      {inr.format(est.total_amount)} · {formatDate(est.created_at)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={STATUS_VARIANT[result ?? est.status] ?? "secondary"}>{result ?? est.status}</Badge>
                    {canRespond ? (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={pending}
                          onClick={() =>
                            run(est.id, async () => {
                              await declineEstimateAction(est.id);
                              setResolved((r) => ({ ...r, [est.id]: "declined" }));
                            })
                          }
                        >
                          Decline
                        </Button>
                        <Button
                          size="sm"
                          disabled={pending}
                          onClick={() =>
                            run(est.id, async () => {
                              await approveEstimateAction(est.id);
                              setResolved((r) => ({ ...r, [est.id]: "approved" }));
                            })
                          }
                        >
                          Approve
                        </Button>
                      </>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase">My invoices</h2>
        {invoices.length === 0 ? (
          <p className="text-sm text-muted-foreground">No invoices yet.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {invoices.map((inv) => (
              <div key={inv.id} className="flex items-center justify-between rounded-xl border border-border p-4">
                <div>
                  <p className="font-medium">{inv.number ?? "Invoice"}</p>
                  <p className="text-sm text-muted-foreground">
                    {inr.format(inv.total_amount)} · {formatDate(inv.created_at)}
                  </p>
                </div>
                <div className="text-right">
                  <Badge variant={STATUS_VARIANT[inv.status] ?? "secondary"}>{inv.status}</Badge>
                  <p className="mt-1 text-sm font-medium">
                    {inv.balance_amount > 0 ? `Balance: ${inr.format(inv.balance_amount)}` : "Paid in full"}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
