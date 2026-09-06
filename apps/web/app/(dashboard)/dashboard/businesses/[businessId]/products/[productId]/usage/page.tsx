import { notFound } from "next/navigation";
import { getProduct, getWorkspaceForProduct } from "@cofounderai/module-discovery/lib/tenancy/queries";
import { getWorkspaceUsage } from "@cofounderai/module-discovery/lib/usage/queries";
import { creditsUsedPercent } from "@cofounderai/module-discovery/lib/usage/format";
import { FREE_TIER_MONTHLY_RUN_LIMIT } from "@cofounderai/module-discovery/lib/usage/limits";

const OPERATION_LABEL: Record<string, string> = {
  understand_product: "Product profile",
  generate_icp: "ICP generation",
  research_prospect: "Prospect research",
  discover_prospects: "Prospect discovery",
  generate_outreach_strategy: "Outreach strategy",
  generate_outreach_message: "Message generation",
  generate_reply: "Reply generation",
  classify_reply: "Reply classification",
  chat: "AI assistant",
};

export default async function UsagePage({
  params,
}: {
  params: Promise<{ businessId: string; productId: string }>;
}) {
  const { businessId, productId } = await params;
  const product = await getProduct(productId);
  if (!product || product.business_id !== businessId) notFound();

  const workspace = await getWorkspaceForProduct(product.id);
  if (!workspace) notFound();

  const usage = await getWorkspaceUsage(workspace.id);
  const percent = creditsUsedPercent(usage.totalCost);
  const periodLabel = new Date(usage.periodStart).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3 rounded-md border p-4">
        <div className="flex items-center justify-between">
          <h2 className="font-medium">Usage this month</h2>
          <span className="text-sm text-muted-foreground">{periodLabel}</span>
        </div>

        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between text-sm">
            <span>{percent}% of AI credits used</span>
            <span className="text-muted-foreground">
              {usage.totalRuns} / {FREE_TIER_MONTHLY_RUN_LIMIT} runs
            </span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary" style={{ width: `${percent}%` }} />
          </div>
          {percent >= 100 || usage.totalRuns >= FREE_TIER_MONTHLY_RUN_LIMIT ? (
            <p className="text-sm text-destructive">
              Free-tier limit reached for this month -- AI features are paused until next
              month.
            </p>
          ) : null}
        </div>
      </section>

      <section className="flex flex-col gap-3 rounded-md border p-4">
        <h2 className="font-medium">By operation</h2>
        {usage.byOperation.length === 0 ? (
          <p className="text-sm text-muted-foreground">No AI usage yet this month.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {usage.byOperation.map((op) => (
              <li
                key={op.operation}
                className="flex items-center justify-between rounded-md border p-3 text-sm"
              >
                <span>{OPERATION_LABEL[op.operation] ?? op.operation}</span>
                <span className="text-muted-foreground">
                  {op.runs} run{op.runs === 1 ? "" : "s"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
