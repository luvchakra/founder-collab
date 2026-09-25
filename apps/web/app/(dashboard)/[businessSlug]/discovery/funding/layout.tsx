import type { ReactNode } from "react";
import { Lock } from "lucide-react";
import { SectionTabs } from "@cofounderai/module-discovery/components/marketing/section-tabs";
import { EmptyState } from "@cofounderai/core/ui/empty-state";
import { fundingContext } from "./context";

/** FND-03..14 — the Funding section's shared tab strip, and its access gate. */
export default async function FundingLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ businessSlug: string }>;
}) {
  const { businessSlug } = await params;
  const { root, canView } = await fundingContext(businessSlug);
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6">
      <SectionTabs
        tabs={[
          { href: root, label: "Dashboard", exact: true },
          { href: `${root}/profile`, label: "Funding Profile" },
          { href: `${root}/readiness`, label: "Investor Readiness" },
          { href: `${root}/rounds`, label: "Fundraising" },
          { href: `${root}/investors`, label: "Investors" },
          { href: `${root}/outreach`, label: "Investor Outreach" },
          { href: `${root}/data-room`, label: "Data Room" },
          { href: `${root}/due-diligence`, label: "Due Diligence" },
          { href: `${root}/analytics`, label: "Analytics" },
        ]}
      />
      {canView ? (
        children
      ) : (
        <div className="rounded-xl border bg-card p-10">
          <EmptyState icon={Lock} message="Funding is limited to people with funding access. Ask an owner or admin if you need it." />
        </div>
      )}
    </main>
  );
}
