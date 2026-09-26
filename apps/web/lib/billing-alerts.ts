import type { ShellAlert } from "@cofounderai/core/shell/types";
import { createClient } from "@cofounderai/core/db/server";
import { resolveBusinessSlugById } from "@cofounderai/core/businesses/resolve";

/**
 * BILL-34 -- billing states in the bell (§60), derived from the business's own
 * subscription like every other alert there (nothing stored): a payment that needs
 * attention, and a plan that ends within a week. RLS scopes the read to the caller's
 * businesses.
 */
export async function getBillingAlerts(businessIds: string[]): Promise<ShellAlert[]> {
  if (businessIds.length === 0) return [];
  const supabase = await createClient({ schema: "platform" });
  const soon = new Date(Date.now() + 7 * 86400_000).toISOString();
  const { data, error } = await supabase
    .from("subscriptions")
    .select("id, business_id, status, cancel_at_period_end, current_period_end")
    .in("business_id", businessIds)
    .or(`status.in.(past_due,unpaid),and(status.eq.cancel_scheduled,current_period_end.lte.${soon})`);
  if (error) throw error;
  const rows = (data ?? []) as { id: string; business_id: string; status: string; current_period_end: string | null }[];
  return Promise.all(
    rows.map(async (s) => {
      const slug = await resolveBusinessSlugById(s.business_id);
      const href = slug ? `/${slug}/billing` : "/dashboard/settings/billing";
      const ends = s.current_period_end ? new Date(s.current_period_end).toLocaleDateString(undefined, { day: "numeric", month: "short" }) : "soon";
      return {
        id: `billing-${s.status}-${s.id}`,
        severity: "warning" as const,
        message:
          s.status === "past_due"
            ? "Payment needs attention: we couldn't confirm your latest subscription payment."
            : s.status === "unpaid"
              ? "Your subscription is unpaid, so modules are read-only. Update your payment method."
              : `Your plan ends on ${ends} and won't renew.`,
        href,
        businessId: s.business_id,
      };
    }),
  );
}
