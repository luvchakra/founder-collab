import Link from "next/link";
import { listBusinesses } from "@cofounderai/module-discovery/lib/tenancy/queries";
import { resolveBusinessSlugById } from "@cofounderai/core/businesses/resolve";
import { getBusinessSubscription } from "@cofounderai/core/billing/overview";
import { SUBSCRIPTION_STATUS_LABEL } from "@cofounderai/core/billing/state";

/** BILL-19 -- each business's plan, one line each, linking to that business's billing
 * page (plans are per business; this account page is only the index). */
export async function SubscriptionPlans({ accountId }: { accountId: string }) {
  const businesses = await listBusinesses(accountId);
  const rows = await Promise.all(
    businesses.map(async (b) => {
      const [slug, subscription] = await Promise.all([resolveBusinessSlugById(b.id), getBusinessSubscription(b.id)]);
      return { id: b.id, name: b.name, slug, subscription };
    }),
  );
  return (
    <section className="flex flex-col gap-4 rounded-xl border border-border p-4">
      <div>
        <h2 className="text-lg font-semibold">Plans</h2>
        <p className="mt-1 text-sm text-muted-foreground">Each business has its own plan, which decides the modules it can use.</p>
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No businesses yet.</p>
      ) : (
        <ul className="divide-y">
          {rows.map((r) => {
            const live = r.subscription && !["cancelled", "expired", "incomplete"].includes(r.subscription.status);
            return (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
                <div>
                  <p className="font-medium">{r.name}</p>
                  <p className="text-muted-foreground">
                    {live ? `${r.subscription!.planName} · ${SUBSCRIPTION_STATUS_LABEL[r.subscription!.status]}` : "No plan selected"}
                  </p>
                </div>
                {r.slug ? (
                  <Link href={`/${r.slug}/billing`} className="font-medium text-primary hover:underline">
                    {live ? "Manage plan" : "Choose a plan"}
                  </Link>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
