"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { resolveBusinessIdBySlug } from "@cofounderai/core/businesses/resolve";
import { BillingAccessError } from "@cofounderai/core/billing/access";
import {
  cancelSubscriptionAtPeriodEnd,
  changePlan,
  ManageBillingError,
  openBillingPortal,
  resumeSubscription,
} from "@cofounderai/core/billing/manage";

/**
 * BILL-21..24 -- thin wrappers over billing/manage.ts. The business comes from the slug
 * through an RLS-scoped lookup, and manage.ts re-checks that the caller is an owner or
 * admin of its account. Errors a customer should see come back as `{ error }`.
 */
type ActionResult = { ok: true } | { ok: false; error: string };

async function businessFor(slug: string): Promise<string> {
  const id = await resolveBusinessIdBySlug(slug);
  if (!id) throw new BillingAccessError("Business not found.");
  return id;
}

function toResult(error: unknown): ActionResult {
  if (error instanceof ManageBillingError || error instanceof BillingAccessError) return { ok: false, error: error.message };
  console.error(JSON.stringify({ area: "billing.manage", status: "failed", error_code: "unexpected" }));
  return { ok: false, error: "Something went wrong. Please try again." };
}

export async function cancelSubscriptionAction(businessSlug: string, reason: string | null): Promise<ActionResult> {
  try {
    await cancelSubscriptionAtPeriodEnd(await businessFor(businessSlug), reason);
  } catch (error) {
    return toResult(error);
  }
  revalidatePath(`/${businessSlug}/billing`);
  return { ok: true };
}

export async function resumeSubscriptionAction(businessSlug: string): Promise<ActionResult> {
  try {
    await resumeSubscription(await businessFor(businessSlug));
  } catch (error) {
    return toResult(error);
  }
  revalidatePath(`/${businessSlug}/billing`);
  return { ok: true };
}

export async function changePlanAction(businessSlug: string, planId: string, interval: "month" | "year"): Promise<ActionResult> {
  if (interval !== "month" && interval !== "year") return { ok: false, error: "Choose monthly or yearly billing." };
  try {
    await changePlan(await businessFor(businessSlug), planId, interval);
  } catch (error) {
    return toResult(error);
  }
  revalidatePath(`/${businessSlug}/billing`);
  return { ok: true };
}

/** Sends the customer to their provider's billing page (payment method, invoices). */
export async function manageBillingAction(businessSlug: string): Promise<ActionResult> {
  let url: string;
  try {
    url = await openBillingPortal(await businessFor(businessSlug), businessSlug);
  } catch (error) {
    return toResult(error);
  }
  redirect(url);
}
