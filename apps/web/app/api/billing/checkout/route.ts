import { NextResponse } from "next/server";
import { z } from "zod";
import { resolveBusinessIdBySlug } from "@cofounderai/core/businesses/resolve";
import { BillingAccessError } from "@cofounderai/core/billing/access";
import { CheckoutError, startCheckout } from "@cofounderai/core/billing/checkout";
import { BillingNotConfiguredError } from "@cofounderai/core/billing/subscription-types";

/**
 * BILL-08 -- POST /api/billing/checkout (§26). The body names the business (by slug, the
 * same way every business page does), the plan, the interval and an idempotency key --
 * and is strict, so an `amount`, `currency`, `providerPriceId` or `modules` field is a 400,
 * not something quietly ignored (§88). Everything that decides what is charged is
 * resolved server-side by startCheckout().
 */
const bodySchema = z
  .object({
    businessSlug: z.string().trim().min(1).max(200),
    planId: z.string().uuid(),
    billingInterval: z.enum(["month", "year"]).default("month"),
    idempotencyKey: z.string().uuid(),
  })
  .strict();

export async function POST(request: Request) {
  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "Invalid checkout request." }, { status: 400 });
  }

  // RLS-scoped: a slug the caller can't see resolves to nothing.
  const businessId = await resolveBusinessIdBySlug(body.businessSlug);
  if (!businessId) return NextResponse.json({ error: "Business not found." }, { status: 404 });

  try {
    const result = await startCheckout({
      businessId,
      businessSlug: body.businessSlug,
      planId: body.planId,
      billingInterval: body.billingInterval,
      idempotencyKey: body.idempotencyKey,
    });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof BillingAccessError) return NextResponse.json({ error: error.message }, { status: 403 });
    if (error instanceof CheckoutError) {
      const status =
        error.code === "already_subscribed" || error.code === "already_on_plan"
          ? 409
          : error.code === "provider_error"
            ? 502
            : error.code === "rate_limited"
              ? 429
              : 400;
      return NextResponse.json({ error: error.message, code: error.code }, { status });
    }
    if (error instanceof BillingNotConfiguredError) return NextResponse.json({ error: error.message, code: "not_configured" }, { status: 503 });
    console.error(JSON.stringify({ area: "billing.checkout", status: "failed", error_code: "unexpected" }));
    return NextResponse.json({ error: "We couldn't start checkout. Please try again." }, { status: 500 });
  }
}
