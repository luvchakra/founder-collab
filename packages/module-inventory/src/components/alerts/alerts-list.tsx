"use client";

import { useTransition } from "react";
import { AlertTriangle, Bell, CheckCircle2, XCircle } from "lucide-react";
import { Button } from "@cofounderai/core/ui/button";
import { Badge } from "@cofounderai/core/ui/badge";
import { formatDate } from "@cofounderai/core/lib/format";
import type { Alert, AlertStatus } from "../../lib/alerts/types";

const SEVERITY_VARIANT: Record<string, "default" | "secondary" | "destructive"> = {
  info: "secondary",
  warning: "default",
  critical: "destructive",
};

/** Ported from stockpilot-ai-ops's routes/_authenticated/alerts.tsx `Alerts` component
 * -- status updates go through a Server Action + useTransition (see
 * purchase-orders-list.tsx's own runPrimaryAction for the precedent) instead of a
 * react-query mutation. */
export function AlertsList({
  alerts,
  canManage,
  updateStatusAction,
}: {
  alerts: Alert[];
  canManage: boolean;
  updateStatusAction: (alertId: string, status: AlertStatus) => Promise<void>;
}) {
  const [pending, startTransition] = useTransition();

  const openAlerts = alerts.filter((a) => a.status === "open" || a.status === "acknowledged");
  const closedAlerts = alerts.filter((a) => a.status === "resolved" || a.status === "dismissed");

  if (alerts.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border p-12 text-center">
        <Bell className="size-8 text-muted-foreground" aria-hidden="true" />
        <p className="text-sm text-muted-foreground">No alerts. Everything looks healthy.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        {openAlerts.length === 0 ? (
          <p className="text-sm text-muted-foreground">No open alerts.</p>
        ) : (
          openAlerts.map((alert) => (
            <div
              key={alert.id}
              className="flex flex-col gap-3 rounded-2xl border border-border p-4 sm:flex-row sm:items-start sm:justify-between"
            >
              <div className="flex gap-3">
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{alert.title}</span>
                    <Badge variant={SEVERITY_VARIANT[alert.severity] ?? "secondary"}>{alert.severity}</Badge>
                  </div>
                  {alert.description ? (
                    <p className="mt-1 text-sm text-muted-foreground">{alert.description}</p>
                  ) : null}
                  {alert.recommended_action ? (
                    <p className="mt-1 text-xs text-muted-foreground">Recommended: {alert.recommended_action}</p>
                  ) : null}
                  <p className="mt-1 text-xs text-muted-foreground">{formatDate(alert.created_at)}</p>
                </div>
              </div>
              {canManage ? (
                <div className="flex shrink-0 gap-2">
                  {alert.status === "open" ? (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={pending}
                      onClick={() => startTransition(() => updateStatusAction(alert.id, "acknowledged"))}
                    >
                      Acknowledge
                    </Button>
                  ) : null}
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={pending}
                    onClick={() => startTransition(() => updateStatusAction(alert.id, "resolved"))}
                  >
                    <CheckCircle2 className="size-4" aria-hidden="true" />
                    Resolve
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={pending}
                    onClick={() => startTransition(() => updateStatusAction(alert.id, "dismissed"))}
                  >
                    <XCircle className="size-4" aria-hidden="true" />
                    Dismiss
                  </Button>
                </div>
              ) : null}
            </div>
          ))
        )}
      </div>

      {closedAlerts.length > 0 ? (
        <div>
          <h2 className="mb-3 text-sm font-semibold text-muted-foreground">Resolved &amp; dismissed</h2>
          <div className="flex flex-col gap-2">
            {closedAlerts.map((alert) => (
              <div
                key={alert.id}
                className="flex items-center justify-between rounded-xl border border-border px-4 py-3 text-sm text-muted-foreground"
              >
                <span>{alert.title}</span>
                <Badge variant="secondary">{alert.status}</Badge>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
