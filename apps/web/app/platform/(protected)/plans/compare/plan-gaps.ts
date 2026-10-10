export type PlanForComparison = { id: string; name: string; price: number; modules: readonly string[] };

export type PlanGap = { planId: string; planName: string; cheaperPlanName: string };

/**
 * Paid plans that include no module the next cheaper plan lacks -- the "a paid plan
 * unlocks nothing" finding from the 2026-10-10 billing readiness check
 * (docs/design/subscription-billing.md). Compares module sets only; feature entitlements
 * and quantity limits can still tell two plans apart.
 */
export function findPlanGaps(plans: readonly PlanForComparison[]): PlanGap[] {
  const gaps: PlanGap[] = [];
  for (const plan of plans) {
    if (plan.price <= 0) continue;
    const cheaper = plans
      .filter((other) => other.id !== plan.id && other.price < plan.price)
      .sort((a, b) => b.price - a.price)[0];
    if (!cheaper) continue;
    const cheaperModules = new Set(cheaper.modules);
    if (plan.modules.every((key) => cheaperModules.has(key))) {
      gaps.push({ planId: plan.id, planName: plan.name, cheaperPlanName: cheaper.name });
    }
  }
  return gaps;
}
