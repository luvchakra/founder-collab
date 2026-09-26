"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@cofounderai/core/lib/utils";

const TABS = [
  { href: "/platform/billing", label: "Overview" },
  { href: "/platform/billing/subscriptions", label: "Subscriptions" },
  { href: "/platform/billing/payments", label: "Payments" },
  { href: "/platform/billing/events", label: "Webhook events" },
  { href: "/platform/billing/providers", label: "Providers" },
] as const;

/** BILL-26 -- the billing console's own tab strip (§69), shared by every page under /platform/billing. */
export function BillingSubnav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Billing sections" className="-mx-1 flex gap-1 overflow-x-auto border-b border-zinc-800 px-1 text-sm">
      {TABS.map((tab) => {
        const active = tab.href === "/platform/billing" ? pathname === tab.href : pathname === tab.href || pathname.startsWith(`${tab.href}/`);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "-mb-px shrink-0 border-b-2 px-3 py-2 whitespace-nowrap transition-colors",
              active ? "border-blue-500 font-medium text-zinc-50" : "border-transparent text-zinc-400 hover:text-zinc-100",
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
