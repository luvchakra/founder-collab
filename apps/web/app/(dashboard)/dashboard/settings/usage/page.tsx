import { redirect } from "next/navigation";
import {
  getCurrentAccount,
  getWorkspaceForProduct,
  listBusinesses,
  listProducts,
} from "@cofounderai/module-discovery/lib/tenancy/queries";
import { getWorkspaceUsage } from "@cofounderai/module-discovery/lib/usage/queries";
import { creditsUsedPercent } from "@cofounderai/module-discovery/lib/usage/format";
import { FREE_TIER_MONTHLY_COST_LIMIT_USD } from "@cofounderai/module-discovery/lib/usage/limits";

/** Usage lives under the avatar menu (not any one product's tabs) because it covers
 * every business/product on the account, not a single workspace. */
export default async function AccountUsagePage() {
  const account = await getCurrentAccount();
  if (!account) redirect("/login");

  const businesses = await listBusinesses(account.id);
  const productLists = await Promise.all(
    businesses.map((business) => listProducts(business.id)),
  );
  const totalWorkspaces = productLists.reduce((sum, products) => sum + products.length, 0);

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
  const totalCost = rows.reduce((sum, r) => sum + r.usage.totalCost, 0);
  // Each workspace gets its own free-tier allowance (lib/usage/limits.ts), so the overall
  // percent blends spend against every workspace's combined allowance, not one shared cap.
  const overallPercent = creditsUsedPercent(
    totalCost,
    FREE_TIER_MONTHLY_COST_LIMIT_USD * Math.max(totalWorkspaces, 1),
  );
  const periodLabel =
    rows.length > 0
      ? new Date(rows[0]!.usage.periodStart).toLocaleDateString(undefined, {
          month: "long",
          year: "numeric",
        })
      : new Date().toLocaleDateString(undefined, { month: "long", year: "numeric" });

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 p-8">
      <div>
        <h1 className="text-xl font-semibold">Usage</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          AI usage across every business and product on your account.
        </p>
      </div>

      <section className="flex flex-col gap-3 rounded-md border p-4">
        <div className="flex items-center justify-between">
          <h2 className="font-medium">This month</h2>
          <span className="text-sm text-muted-foreground">{periodLabel}</span>
        </div>
        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between text-sm">
            <span>{overallPercent}% of AI credits used</span>
            <span className="text-muted-foreground">{totalRuns} runs</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary"
              style={{ width: `${overallPercent}%` }}
            />
          </div>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-medium">By product</h2>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No AI usage yet this month.</p>
        ) : (
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/30 text-left text-muted-foreground">
                  <th className="py-2 pr-4 pl-3 font-medium">Business</th>
                  <th className="py-2 pr-4 font-medium">Product</th>
                  <th className="py-2 pr-4 font-medium">Runs</th>
                  <th className="py-2 pr-4 font-medium">Credits used</th>
                </tr>
              </thead>
              <tbody>
                {rows
                  .sort((a, b) => b.usage.totalCost - a.usage.totalCost)
                  .map((row, i) => (
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
