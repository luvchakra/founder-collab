"use client";

import { useState } from "react";
import Link from "next/link";
import { Check } from "lucide-react";
import type { PlanOption } from "@cofounderai/core/billing/overview";
import { Button } from "@cofounderai/core/ui/button";
import { Badge } from "@cofounderai/core/ui/badge";
import { moduleRegistry } from "@cofounderai/module-registry";
import { cn } from "@cofounderai/core/lib/utils";

function money(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat(currency === "INR" ? "en-IN" : undefined, { style: "currency", currency, maximumFractionDigits: Number.isInteger(amount) ? 0 : 2 }).format(amount);
  } catch {
    return `${currency} ${amount}`;
  }
}

export function PlanPicker({
  businessSlug,
  plans,
  currentPlanId,
  currentInterval,
  hasPaidSubscription,
  canManage,
}: {
  businessSlug: string;
  plans: PlanOption[];
  currentPlanId: string | null;
  currentInterval: "month" | "year" | null;
  hasPaidSubscription: boolean;
  canManage: boolean;
}) {
  const yearlyOffered = plans.some((p) => p.prices.year);
  const [interval, setInterval] = useState<"month" | "year">(currentInterval ?? "month");
  const featured = plans.filter((p) => p.price > 0).sort((a, b) => a.displayOrder - b.displayOrder)[0]?.id;

  return (
    <div className="flex flex-col gap-5">
      {yearlyOffered ? (
        <div role="radiogroup" aria-label="Billing interval" className="inline-flex self-center rounded-lg border bg-card p-1">
          {(["month", "year"] as const).map((value) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={interval === value}
              onClick={() => setInterval(value)}
              className={cn("rounded-md px-4 py-1.5 text-sm", interval === value ? "bg-primary/10 font-medium text-primary" : "text-muted-foreground")}
            >
              {value === "month" ? "Monthly" : "Yearly"}
            </button>
          ))}
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {plans.map((plan) => {
          const free = plan.price === 0;
          const price = plan.prices[interval];
          const current = plan.id === currentPlanId && (free || currentInterval === interval);
          const available = free || Boolean(price);
          const href = hasPaidSubscription
            ? `/${businessSlug}/billing/change?plan=${plan.id}&interval=${interval}`
            : `/${businessSlug}/billing/review?plan=${plan.id}&interval=${interval}`;
          return (
            <section
              key={plan.id}
              aria-label={plan.name}
              className={cn("flex flex-col gap-4 rounded-xl border bg-card p-5", plan.id === featured && "border-primary ring-1 ring-primary/30")}
            >
              <div className="flex items-start justify-between gap-2">
                <h2 className="text-lg font-semibold">{plan.name}</h2>
                {current ? <Badge variant="success">Current plan</Badge> : plan.id === featured ? <Badge variant="solid">Most popular</Badge> : null}
              </div>
              <p className="text-2xl font-semibold">
                {free ? money(0, plan.currency) : price ? money(price.amount, price.currency) : "—"}
                <span className="text-sm font-normal text-muted-foreground"> / {interval === "year" && !free ? "year" : "month"}</span>
              </p>
              {plan.description ? <p className="text-sm text-muted-foreground">{plan.description}</p> : null}
              <ul className="flex flex-1 flex-col gap-1.5 text-sm">
                {moduleRegistry.map((m) => {
                  const included = plan.modules.includes(m.key);
                  return (
                    <li key={m.key} className={cn("flex items-center gap-2", !included && "text-muted-foreground line-through")}>
                      <Check className={cn("size-4", included ? "text-success" : "opacity-0")} aria-hidden="true" />
                      {m.name}
                      <span className="sr-only">{included ? "included" : "not included"}</span>
                    </li>
                  );
                })}
              </ul>
              {!canManage ? null : current ? (
                <Button disabled variant="outline">
                  Current plan
                </Button>
              ) : free && hasPaidSubscription ? (
                <Button asChild variant="outline">
                  <Link href={`/${businessSlug}/billing/cancel`}>Cancel to return to {plan.name}</Link>
                </Button>
              ) : available ? (
                <Button asChild variant={plan.id === featured ? "default" : "outline"}>
                  <Link href={href}>{free ? "Get started" : `Choose ${plan.name}`}</Link>
                </Button>
              ) : (
                <Button disabled variant="outline">
                  Not available {interval === "year" ? "yearly" : "monthly"}
                </Button>
              )}
            </section>
          );
        })}
      </div>
      {!canManage ? <p className="text-center text-sm text-muted-foreground">Only account owners and admins can change the plan.</p> : null}
    </div>
  );
}
