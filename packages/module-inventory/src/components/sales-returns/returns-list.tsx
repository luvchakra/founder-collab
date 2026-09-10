"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { Plus, RotateCcw } from "lucide-react";
import { Button } from "@cofounderai/core/ui/button";
import { Badge } from "@cofounderai/core/ui/badge";
import { EmptyState } from "@cofounderai/core/ui/empty-state";
import { toast } from "@cofounderai/core/ui/sonner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@cofounderai/core/ui/table";
import { ReturnForm, type ReturnActionState } from "./return-form";
import { ReturnDetail } from "./return-detail";
import { formatDate } from "@cofounderai/core/lib/format";
import {
  primaryAction,
  type EligibleSalesOrder,
  type SalesReturn,
  type SalesReturnItem,
  type SoItemForReturn,
} from "../../lib/sales-returns/types";

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  draft: "secondary",
  approved: "outline",
  completed: "default",
  cancelled: "destructive",
};

/** Ported from stockpilot-ai-ops's routes/_authenticated/sales-returns.tsx
 * `SalesReturns` component. Reads the `so` query param (set by Sales Orders' own
 * "Create return" navigation) to preselect and open the create form, then clears it --
 * matches the original's own validateSearch + navigate({search:{}}) round trip. */
export function ReturnsList({
  salesReturns,
  eligibleSalesOrders,
  canCreate,
  canApprove,
  canCancel,
  createAction,
  approveAction,
  setStatusAction,
  fetchItems,
  fetchSoItems,
}: {
  salesReturns: SalesReturn[];
  eligibleSalesOrders: EligibleSalesOrder[];
  canCreate: boolean;
  canApprove: boolean;
  canCancel: boolean;
  createAction: (prevState: ReturnActionState, formData: FormData) => Promise<ReturnActionState>;
  approveAction: (returnId: string) => Promise<void>;
  setStatusAction: (returnId: string, status: string) => Promise<void>;
  fetchItems: (returnId: string) => Promise<SalesReturnItem[]>;
  fetchSoItems: (salesOrderId: string) => Promise<SoItemForReturn[]>;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const soFromQuery = searchParams.get("so");

  const [formOpen, setFormOpen] = useState(false);
  const [detailTarget, setDetailTarget] = useState<SalesReturn | null>(null);
  const [detailItems, setDetailItems] = useState<SalesReturnItem[]>([]);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (soFromQuery) setFormOpen(true);
  }, [soFromQuery]);

  const closeForm = () => {
    setFormOpen(false);
    if (soFromQuery) router.replace(pathname);
  };

  const canRunPrimaryAction = (status: string) => {
    if (status === "draft" || status === "approved") return canApprove;
    return false;
  };

  const openDetail = async (r: SalesReturn) => {
    setDetailTarget(r);
    setDetailItems(await fetchItems(r.id));
  };

  const runPrimaryAction = (r: SalesReturn) => {
    const action = primaryAction(r.status);
    if (!action) return;
    startTransition(async () => {
      try {
        if (action.kind === "approve") await approveAction(r.id);
        else await setStatusAction(r.id, action.next);
        if (detailTarget?.id === r.id) await openDetail(r);
        toast.success(`${r.return_number}: ${action.label.toLowerCase()} succeeded.`);
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : `Could not ${action.label.toLowerCase()} ${r.return_number}.`,
        );
      }
    });
  };

  return (
    <div className="flex flex-col gap-4">
      {canCreate ? (
        <div className="flex justify-end">
          <Button size="sm" onClick={() => setFormOpen(true)}>
            <Plus className="size-4" aria-hidden="true" />
            New return
          </Button>
        </div>
      ) : null}

      {salesReturns.length === 0 ? (
        <EmptyState icon={RotateCcw} message="No sales returns yet. Create one from a shipped or delivered order." />
      ) : (
        <div className="rounded-2xl border border-border">
          {/* Compact cards below `md` -- this platform's own rule that a table of rows
              never gets cropped or scrolled sideways on a small screen. */}
          <ul className="divide-y md:hidden">
            {salesReturns.map((r) => (
              <li key={r.id} className="flex flex-col gap-2 p-3 text-sm">
                <div className="flex min-w-0 items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-mono text-xs text-muted-foreground">{r.return_number}</p>
                    <p className="font-medium break-words">{r.customer_name}</p>
                  </div>
                  <Badge variant={STATUS_VARIANT[r.status]} className="shrink-0">
                    {r.status}
                  </Badge>
                </div>

                <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                  <span>Order {r.so_number}</span>
                  <span>{formatDate(r.created_at)}</span>
                </div>

                <div className="flex justify-end gap-2">
                  <Button variant="outline" size="sm" onClick={() => openDetail(r)}>
                    View
                  </Button>
                  {primaryAction(r.status) && canRunPrimaryAction(r.status) ? (
                    <Button size="sm" disabled={pending} onClick={() => runPrimaryAction(r)}>
                      {primaryAction(r.status)!.label}
                    </Button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>

          <Table className="hidden md:table">
            <TableHeader>
              <TableRow>
                <TableHead>Return #</TableHead>
                <TableHead>Order</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {salesReturns.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-mono text-xs">{r.return_number}</TableCell>
                  <TableCell className="font-medium">{r.so_number}</TableCell>
                  <TableCell>{r.customer_name}</TableCell>
                  <TableCell>{formatDate(r.created_at)}</TableCell>
                  <TableCell>
                    <Badge variant={STATUS_VARIANT[r.status]}>{r.status}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button variant="outline" size="sm" onClick={() => openDetail(r)}>
                        View
                      </Button>
                      {primaryAction(r.status) && canRunPrimaryAction(r.status) ? (
                        <Button size="sm" disabled={pending} onClick={() => runPrimaryAction(r)}>
                          {primaryAction(r.status)!.label}
                        </Button>
                      ) : null}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {formOpen ? (
        <ReturnForm
          action={createAction}
          eligibleSalesOrders={eligibleSalesOrders}
          initialSalesOrderId={soFromQuery ?? undefined}
          fetchSoItems={fetchSoItems}
          onClose={closeForm}
        />
      ) : null}

      {detailTarget
        ? (() => {
            const current = salesReturns.find((r) => r.id === detailTarget.id) ?? detailTarget;
            const action = primaryAction(current.status);
            return (
              <ReturnDetail
                salesReturn={current}
                items={detailItems}
                canCancel={canCancel}
                primaryLabel={action && canRunPrimaryAction(current.status) ? action.label : null}
                onCancel={() =>
                  startTransition(async () => {
                    try {
                      await setStatusAction(current.id, "cancelled");
                      setDetailTarget(null);
                      toast.success(`${current.return_number} cancelled.`);
                    } catch (error) {
                      toast.error(
                        error instanceof Error ? error.message : `Could not cancel ${current.return_number}.`,
                      );
                    }
                  })
                }
                onPrimaryAction={() => runPrimaryAction(current)}
                onClose={() => setDetailTarget(null)}
              />
            );
          })()
        : null}
    </div>
  );
}
