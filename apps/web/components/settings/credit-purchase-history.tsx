import { Badge } from "@cofounderai/core/ui/badge";
import { inr, formatDate } from "@cofounderai/core/lib/format";

type CreditPurchase = {
  id: string;
  plan_key: string;
  credited_runs: number;
  amount_inr_paise: number;
  status: "created" | "paid" | "failed";
  created_at: string;
};

const STATUS_VARIANT: Record<CreditPurchase["status"], "default" | "secondary" | "destructive"> = {
  paid: "default",
  created: "secondary",
  failed: "destructive",
};
const STATUS_LABEL: Record<CreditPurchase["status"], string> = {
  paid: "Paid",
  created: "Pending",
  failed: "Failed",
};

/** Compact purchase history under the Billing page's own "Buy more credits" cards --
 * `created` (an order that never completed checkout) and `failed` both show up as-is
 * rather than being hidden, so a founder whose payment didn't go through can see that and
 * isn't left wondering where their money went. */
export function CreditPurchaseHistory({ purchases }: { purchases: CreditPurchase[] }) {
  if (purchases.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-sm font-medium">Purchase history</h3>
      <ul className="divide-y rounded-lg border border-border">
        {purchases.map((p) => (
          <li key={p.id} className="flex items-center justify-between gap-3 p-3 text-sm">
            <div className="min-w-0">
              <p className="font-medium">{p.credited_runs.toLocaleString("en-IN")} runs</p>
              <p className="text-xs text-muted-foreground">{formatDate(p.created_at)}</p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <span className="text-muted-foreground">{inr.format(p.amount_inr_paise / 100)}</span>
              <Badge variant={STATUS_VARIANT[p.status]}>{STATUS_LABEL[p.status]}</Badge>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
