import Link from "next/link";
import { listPlatformPlans } from "@cofounderai/core/admin/platform-plans";
import { Badge } from "@cofounderai/core/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@cofounderai/core/ui/table";
import { PlanDialog } from "./plan-dialog";

/**
 * PLATFORM-P0-04.1 ("Plan Management", docs/plan/09-PLATFORM-ADMIN-PORTAL-BACKLOG.md §8):
 * the platform-wide subscription/pricing catalog admin screen. See
 * `packages/core/src/admin/platform-plans.ts` and its migration's own docstrings for what
 * this table is and why it's genuinely new, not a duplicate of `core.modules`/
 * `core.licenses`.
 *
 * Deliberately NOT built here, left to their own later sub-stories in this same §8
 * section: module entitlements per plan (04.3), feature-level entitlements (04.4),
 * quantity limits (04.5/04.6) -- 04.2 ("Plan Entitlements") is the composite view of those
 * three once they exist, not its own table. This screen is the plan catalog itself:
 * name, description, price, billing interval, currency, status, display order, marketing
 * visibility -- exactly 04.1's own field list, plus the four-value lifecycle status 04.7
 * names for that same column.
 *
 * Desktop table / mobile card split per CLAUDE.md development principle #12 and
 * docs/design/claude-ui-design-rules.md rule 5, mirroring
 * `(dashboard)/.../crm/leads/page.tsx`'s own established `<ul className="divide-y
 * md:hidden">` / `<Table className="hidden md:table">` split -- with the same explicit
 * zinc-* overrides every other `/platform` page needs (see branding-form.tsx's own note)
 * since the vendored Table's default `border-muted-foreground` tokens resolve against the
 * site's light theme, which `/platform` never opts into.
 */
export default async function PlatformPlansPage() {
  const plans = await listPlatformPlans();

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Subscription Plans</h1>
          <p className="text-sm text-zinc-400">
            The platform-wide pricing catalog every WonderArc business subscribes from.
          </p>
        </div>
        <PlanDialog />
      </div>

      <div className="rounded-2xl border border-zinc-800">
        <ul className="divide-y divide-zinc-800 md:hidden">
          {plans.map((plan) => (
            <li key={plan.id} className="flex flex-col gap-2 p-3 text-sm text-zinc-100">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-medium">{plan.name}</p>
                  <p className="text-xs text-zinc-500">{plan.key}</p>
                </div>
                <StatusBadge status={plan.status} />
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-zinc-400">
                <span>
                  {plan.currency} {plan.price} / {plan.billingInterval}
                </span>
                <span>Order {plan.displayOrder}</span>
                <span>{plan.marketingVisible ? "Marketing visible" : "Hidden from marketing"}</span>
              </div>
              <div className="flex items-center gap-3">
                <PlanDialog plan={plan} />
                <Link href={`/platform/plans/${plan.id}/entitlements`} className="text-xs text-zinc-400 hover:text-zinc-100">
                  Entitlements
                </Link>
              </div>
            </li>
          ))}
        </ul>

        <Table className="hidden md:table">
          <TableHeader>
            <TableRow className="border-zinc-800 hover:bg-transparent">
              <TableHead className="text-zinc-400">Plan</TableHead>
              <TableHead className="text-zinc-400">Price</TableHead>
              <TableHead className="text-zinc-400">Status</TableHead>
              <TableHead className="text-zinc-400">Order</TableHead>
              <TableHead className="text-zinc-400">Marketing</TableHead>
              <TableHead className="text-right text-zinc-400">
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {plans.map((plan) => (
              <TableRow key={plan.id} className="border-zinc-800 hover:bg-zinc-900/60">
                <TableCell className="text-zinc-100">
                  <p className="font-medium">{plan.name}</p>
                  <p className="text-xs text-zinc-500">{plan.key}</p>
                </TableCell>
                <TableCell className="text-zinc-300">
                  {plan.currency} {plan.price} / {plan.billingInterval}
                </TableCell>
                <TableCell>
                  <StatusBadge status={plan.status} />
                </TableCell>
                <TableCell className="text-zinc-300">{plan.displayOrder}</TableCell>
                <TableCell className="text-zinc-300">{plan.marketingVisible ? "Visible" : "Hidden"}</TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-3">
                    <Link
                      href={`/platform/plans/${plan.id}/entitlements`}
                      className="text-xs text-zinc-400 hover:text-zinc-100"
                    >
                      Entitlements
                    </Link>
                    <PlanDialog plan={plan} />
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const variant = status === "active" ? "default" : status === "draft" ? "outline" : "secondary";
  const className = status === "draft" ? "border-zinc-700 text-zinc-300" : undefined;
  return (
    <Badge variant={variant} className={className}>
      {status}
    </Badge>
  );
}
