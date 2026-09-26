import type { ReactNode } from "react";
import { BillingSubnav } from "./billing-subnav";

/**
 * BILL-26..32 -- Platform Admin billing console (docs/plan/14-SUBSCRIPTION-BILLING-BACKLOG.md
 * §36-§46, §69-§70). Authorization is unchanged: `platform/layout.tsx`'s requireSuperadmin()
 * and `(protected)/layout.tsx`'s AAL2 check wrap this, and every core read/write called by
 * these pages re-checks requireSuperadmin() itself. This layout only adds the tab strip.
 */
export default function PlatformBillingLayout({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <div className="flex flex-col gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Billing</h1>
          <p className="text-sm text-zinc-400">Subscription and payment operations across every business.</p>
        </div>
        <BillingSubnav />
      </div>
      {children}
    </div>
  );
}
