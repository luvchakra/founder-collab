import Link from "next/link";
import { redirect } from "next/navigation";
import {
  getCurrentAccount,
  getWorkspaceForProduct,
  listBusinesses,
  listProducts,
} from "@cofounderai/module-discovery/lib/tenancy/queries";
import { getWorkspaceUsage } from "@cofounderai/module-discovery/lib/usage/queries";
import { creditsUsedPercent } from "@cofounderai/module-discovery/lib/usage/format";
import { FREE_TIER_MONTHLY_RUN_LIMIT } from "@cofounderai/module-discovery/lib/usage/limits";
import { getCreditBalance } from "@cofounderai/core/billing/queries";
import { Button } from "@cofounderai/core/ui/button";

/** Usage lives under the avatar menu (not any one product's tabs) because it covers
 * every business/product on the account, not a single workspace. */
export default async function AccountUsagePage() {
  const account = await getCurrentAccount();
  if (!account) redirect("/login");

  const [businesses, creditBalance] = await Promise.all([listBusinesses(account.id), getCreditBalance(account.id)]);
  const productLists = await Promise.all(
    businesses.map((business) => listProducts(business.id)),
  );

  const rows = (
    await Promise.all(
      businesses.flatMap((business, i) =>
        productLists[i]!.map(async (product) => {
          const workspace = await getWorkspaceForProduct(product.id);
          if (!workspace) return null;
          const usage = await getWorkspaceUsage(workspace.id);
          return { businessName: business.name, productName: product.name, usage };
        }),
      ),
    )
  ).filter((row): row is NonNullable<typeof row> => row !== null && row.usage.totalRuns > 0);

  const totalRuns = rows.reduce((sum, r) => sum + r.usage.totalRuns, 0);
  const periodLabel =
    rows.length > 0
      ? new Date(rows[0]!.usage.periodStart).toLocaleDateString(undefined, {
          month: "long",
          year: "numeric",
        })
      : new Date().toLocaleDateString(undefined, { month: "long", year: "numeric" });

  const sortedRows = [...rows].sort((a, b) => b.usage.totalCost - a.usage.totalCost);

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 p-8">
      <div>
        <h1 className="text-xl font-semibold">Usage</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          AI usage across every business and product on your account.
        </p>
      </div>

      <section className="flex flex-col gap-3 rounded-md border border-border p-4">
        <div className="flex items-center justify-between">
          <h2 className="font-medium">This month</h2>
          <span className="text-sm text-muted-foreground">{periodLabel}</span>
        </div>
        {/* Each workspace has its own free-tier allowance (FREE_TIER_MONTHLY_RUN_LIMIT
            runs, module-discovery/lib/usage/limits.ts) -- there's no single shared cap to
            show one blended "%" against, so this is a plain total instead of the
            previous (misleading) combined progress bar. Per-workspace progress toward
            its own allowance is in the table below. */}
        <p className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">{totalRuns}</span> AI runs across every business and
          product this month.
        </p>
      </section>

      <section className="flex flex-col gap-3 rounded-md border border-border p-4">
        <div>
          <h2 className="font-medium">Purchased AI credits</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Spent automatically once a workspace uses up its own free monthly allowance of{" "}
            {FREE_TIER_MONTHLY_RUN_LIMIT} runs.
          </p>
        </div>
        <div className="flex items-center justify-between gap-3">
          <p className="text-2xl font-semibold">{creditBalance.remaining_runs.toLocaleString("en-IN")} runs</p>
          <Button asChild size="sm" variant="outline">
            <Link href="/dashboard/settings/billing">Buy more credits</Link>
          </Button>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-medium">By product</h2>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No AI usage yet this month.</p>
        ) : (
          <div className="rounded-md border border-border">
            {/* Compact cards below `md` -- this platform's own rule that a table of rows
                never gets cropped or scrolled sideways on a small screen; business and
                product names have no length limit. */}
            <ul className="divide-y md:hidden">
              {sortedRows.map((row, i) => (
                <li key={i} className="flex items-center justify-between gap-3 p-3 text-sm">
                  <div className="min-w-0">
                    <p className="font-medium break-words">{row.productName}</p>
                    <p className="text-xs text-muted-foreground break-words">{row.businessName}</p>
                  </div>
                  <div className="shrink-0 text-right text-xs text-muted-foreground">
                    <p>{row.usage.totalRuns} runs</p>
                    <p>{creditsUsedPercent(row.usage.totalCost)}% of free tier</p>
                  </div>
                </li>
              ))}
            </ul>
            <table className="hidden w-full text-sm md:table">
              <thead>
                <tr className="border-b bg-muted/30 text-left text-muted-foreground">
                  <th className="py-2 pr-4 pl-3 font-medium">Business</th>
                  <th className="py-2 pr-4 font-medium">Product</th>
                  <th className="py-2 pr-4 font-medium">Runs</th>
                  <th className="py-2 pr-4 font-medium">Free-tier used</th>
                </tr>
              </thead>
              <tbody>
                {sortedRows.map((row, i) => (
                  <tr key={i} className="border-b last:border-0">
                    <td className="py-2 pr-4 pl-3">{row.businessName}</td>
                    <td className="py-2 pr-4 text-muted-foreground">{row.productName}</td>
                    <td className="py-2 pr-4 text-muted-foreground">{row.usage.totalRuns}</td>
                    <td className="py-2 pr-4 text-muted-foreground">
                      {creditsUsedPercent(row.usage.totalCost)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
