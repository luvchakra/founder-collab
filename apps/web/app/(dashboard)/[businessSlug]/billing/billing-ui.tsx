import Link from "next/link";
import { StatusBadge, type StatusTone } from "@cofounderai/core/ui/status-badge";
import { SUBSCRIPTION_STATUS_LABEL } from "@cofounderai/core/billing/state";
import type { PaymentStatus, SubscriptionStatus } from "@cofounderai/core/billing/subscription-types";
import { moduleRegistry } from "@cofounderai/module-registry";
import { ModuleIcon } from "@cofounderai/core/shell/module-icon";
import { cn } from "@cofounderai/core/lib/utils";

/** BILL-19..25 -- small pieces every customer billing page shares. Provider-neutral on
 * purpose (§75): nothing here names Razorpay or Stripe. */

export function formatMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat(currency === "INR" ? "en-IN" : undefined, {
      style: "currency",
      currency,
      maximumFractionDigits: Number.isInteger(amount) ? 0 : 2,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

export function formatDay(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

export const intervalLabel = (interval: string | null) => (interval === "year" ? "year" : "month");

const SUBSCRIPTION_TONE: Record<SubscriptionStatus, StatusTone> = {
  incomplete: "warning",
  trialing: "default",
  active: "success",
  past_due: "warning",
  paused: "secondary",
  cancel_scheduled: "warning",
  cancelled: "destructive",
  unpaid: "destructive",
  expired: "secondary",
};

export function SubscriptionStatusBadge({ status }: { status: SubscriptionStatus }) {
  return <StatusBadge status={status} label={SUBSCRIPTION_STATUS_LABEL[status]} tone={SUBSCRIPTION_TONE[status]} />;
}

const PAYMENT_LABEL: Record<PaymentStatus, string> = {
  pending: "Pending",
  succeeded: "Paid",
  failed: "Failed",
  refunded: "Refunded",
  partially_refunded: "Partly refunded",
  disputed: "Disputed",
  chargeback: "Charged back",
};

export function PaymentStatusBadge({ status }: { status: PaymentStatus }) {
  const tone: StatusTone = status === "succeeded" ? "success" : status === "pending" ? "warning" : status === "failed" || status === "chargeback" ? "destructive" : "secondary";
  return <StatusBadge status={status} label={PAYMENT_LABEL[status]} tone={tone} />;
}

export function ModuleList({ modules, className }: { modules: string[]; className?: string }) {
  const known = moduleRegistry.filter((m) => modules.includes(m.key));
  if (known.length === 0) return <p className="text-sm text-muted-foreground">No modules included.</p>;
  return (
    <ul className={cn("flex flex-col gap-2", className)}>
      {known.map((m) => (
        <li key={m.key} className="flex items-center gap-2.5 text-sm">
          <span className="flex size-7 items-center justify-center rounded-md bg-primary/10 text-primary">
            <ModuleIcon name={m.icon} className="size-4" />
          </span>
          {m.name}
        </li>
      ))}
    </ul>
  );
}

const TABS = [
  { href: "", label: "Overview" },
  { href: "/plans", label: "Plans" },
  { href: "/payments", label: "Payment history" },
] as const;

export function BillingTabs({ businessSlug, active }: { businessSlug: string; active: "" | "/plans" | "/payments" }) {
  return (
    <nav aria-label="Billing sections" className="flex gap-1 overflow-x-auto border-b">
      {TABS.map((tab) => (
        <Link
          key={tab.href}
          href={`/${businessSlug}/billing${tab.href}`}
          aria-current={active === tab.href ? "page" : undefined}
          className={cn(
            "-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm transition-colors",
            active === tab.href ? "border-primary font-medium text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
          )}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
