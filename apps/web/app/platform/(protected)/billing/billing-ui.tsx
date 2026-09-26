import type { ReactNode } from "react";
import { formatDateTime } from "@cofounderai/core/lib/format";
import { Badge } from "@cofounderai/core/ui/badge";
import { Button } from "@cofounderai/core/ui/button";
import { Input } from "@cofounderai/core/ui/input";
import { NativeSelect } from "@cofounderai/core/ui/native-select";

/**
 * BILL-26..32 -- small, server-safe presentation helpers shared by every page of the
 * Platform Admin billing console (§36-§46, §70). Same hardcoded dark zinc chrome every
 * other `/platform` page uses (§70: "Use the existing platform dark administration
 * chrome"), since `/platform` never opts into the site's light theme tokens.
 */

export const FIELD_CLASS = "border-zinc-700 bg-zinc-950/60 text-zinc-50 placeholder:text-zinc-500";

/** Currency-aware money; falls back to a plain number when the code isn't a valid ISO 4217 one. */
export function formatMoney(amount: number | null | undefined, currency: string | null | undefined): string {
  if (amount == null) return "—";
  if (!currency) return amount.toFixed(2);
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

export function formatWhen(value: string | null | undefined): string {
  return value ? formatDateTime(value) : "—";
}

/** Reads one string search param, ignoring anything not in `allowed` (never pass a raw value to a filter). */
export function pickParam<T extends string>(value: string | string[] | undefined, allowed: readonly T[]): T | undefined {
  const v = Array.isArray(value) ? value[0] : value;
  return v && (allowed as readonly string[]).includes(v) ? (v as T) : undefined;
}

export function KpiCard({ label, value, detail, tone }: { label: string; value: ReactNode; detail?: ReactNode; tone?: "warning" | "danger" }) {
  const valueClass = tone === "danger" ? "text-red-400" : tone === "warning" ? "text-amber-300" : "";
  return (
    <div className="flex flex-col gap-1 rounded-md border border-zinc-800 bg-zinc-900 p-4">
      <span className="text-xs font-medium tracking-wide text-zinc-400 uppercase">{label}</span>
      <span className={`text-2xl font-semibold ${valueClass}`}>{value}</span>
      {detail ? <span className="text-xs text-zinc-400">{detail}</span> : null}
    </div>
  );
}

export function Panel({ title, description, action, children }: { title: string; description?: ReactNode; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-zinc-800 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold tracking-wide text-zinc-300 uppercase">{title}</h2>
          {description ? <p className="text-xs text-zinc-500">{description}</p> : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <p className="rounded-xl border border-dashed border-zinc-800 p-6 text-center text-sm text-zinc-400">{children}</p>;
}

type Tone = "success" | "warning" | "destructive" | "secondary" | "default";

function ToneBadge({ tone, children }: { tone: Tone; children: ReactNode }) {
  return (
    <Badge variant={tone} className="whitespace-nowrap">
      {children}
    </Badge>
  );
}

const SUBSCRIPTION_TONE: Record<string, Tone> = {
  active: "success",
  trialing: "default",
  past_due: "warning",
  unpaid: "destructive",
  incomplete: "secondary",
  paused: "secondary",
  cancel_scheduled: "warning",
  cancelled: "secondary",
  expired: "secondary",
};

export function SubscriptionStatusBadge({ status, label }: { status: string; label?: string }) {
  return <ToneBadge tone={SUBSCRIPTION_TONE[status] ?? "secondary"}>{label ?? status}</ToneBadge>;
}

const PAYMENT_TONE: Record<string, Tone> = {
  succeeded: "success",
  pending: "default",
  failed: "destructive",
  refunded: "secondary",
  partially_refunded: "warning",
  disputed: "destructive",
  chargeback: "destructive",
};

export function PaymentStatusBadge({ status }: { status: string }) {
  return <ToneBadge tone={PAYMENT_TONE[status] ?? "secondary"}>{status.replace(/_/g, " ")}</ToneBadge>;
}

const EVENT_TONE: Record<string, Tone> = {
  processed: "success",
  received: "default",
  processing: "default",
  unhandled: "warning",
  failed: "destructive",
};

export function EventStatusBadge({ status }: { status: string }) {
  return <ToneBadge tone={EVENT_TONE[status] ?? "secondary"}>{status}</ToneBadge>;
}

export function EnvironmentBadge({ environment }: { environment: string }) {
  return <ToneBadge tone={environment === "live" ? "success" : "warning"}>{environment}</ToneBadge>;
}

export function ProviderLabel({ provider }: { provider: string }) {
  const label = provider === "razorpay" ? "Razorpay" : provider === "stripe" ? "Stripe" : provider === "internal" ? "Internal" : provider;
  return <span className="whitespace-nowrap">{label}</span>;
}

/** A plain GET form: filters live in the URL, so they survive reloads and can be linked. */
export function FilterBar({ children, resetHref }: { children: ReactNode; resetHref: string }) {
  return (
    <form method="get" className="flex flex-wrap items-end gap-3 rounded-2xl border border-zinc-800 p-3">
      {children}
      <div className="flex items-center gap-2">
        <Button type="submit" size="sm">
          Apply
        </Button>
        <a href={resetHref} className="text-xs text-zinc-400 hover:text-zinc-100">
          Reset
        </a>
      </div>
    </form>
  );
}

export function FilterSelect({
  name,
  label,
  value,
  options,
}: {
  name: string;
  label: string;
  value: string | undefined;
  options: readonly { value: string; label: string }[];
}) {
  const id = `filter-${name}`;
  return (
    <div className="flex min-w-36 flex-col gap-1">
      <label htmlFor={id} className="text-xs text-zinc-400">
        {label}
      </label>
      <NativeSelect id={id} name={name} defaultValue={value ?? ""} className={FIELD_CLASS}>
        <option value="">All</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </NativeSelect>
    </div>
  );
}

export function FilterSearch({ name, label, value, placeholder }: { name: string; label: string; value: string | undefined; placeholder?: string }) {
  const id = `filter-${name}`;
  return (
    <div className="flex min-w-48 flex-1 flex-col gap-1">
      <label htmlFor={id} className="text-xs text-zinc-400">
        {label}
      </label>
      <Input id={id} name={name} type="search" defaultValue={value ?? ""} placeholder={placeholder} className={FIELD_CLASS} />
    </div>
  );
}

export const PROVIDER_OPTIONS = [
  { value: "razorpay", label: "Razorpay" },
  { value: "stripe", label: "Stripe" },
] as const;

export const PAYMENT_STATUSES = ["pending", "succeeded", "failed", "refunded", "partially_refunded", "disputed", "chargeback"] as const;
export const EVENT_STATUSES = ["received", "processing", "processed", "unhandled", "failed"] as const;
