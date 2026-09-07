"use server";

import { unstable_rethrow } from "next/navigation";
import { createBusiness, createProduct } from "../lib/tenancy/mutations";
import { getWorkspaceForProduct } from "../lib/tenancy/queries";
import { addKnowledgeSource } from "../lib/knowledge/mutations";
import { understandProduct } from "../lib/ai/understand-product";
import { generateIcp } from "../lib/ai/generate-icp";
import { approveIcpProfile } from "../lib/icp/mutations";
import type { ProductProfile } from "../lib/ai/schemas";
import type { IcpProfile } from "../lib/icp/types";

export type OnboardingResult = {
  businessId: string;
  productId: string;
  icpId: string;
  profile: ProductProfile;
  icp: IcpProfile;
};

export type OnboardingActionState = { error: string } | { data: OnboardingResult } | null;

/** Derives a short, editable-later name from the founder's own free-text description --
 * onboarding (docs/landing-page-requirements.md #27) never asks for a business/product
 * name directly, matching its "keep it minimal" question design. */
function deriveName(text: string): string {
  const words = text.trim().replace(/\s+/g, " ").split(" ");
  let name = "";
  for (const word of words) {
    if ((name + " " + word).trim().length > 40) break;
    name = (name + " " + word).trim();
  }
  return name || "My Product";
}

/**
 * Backs onboarding screens 1-4: turns the founder's description, website, and target
 * audience into a real business + product + knowledge source, then runs the same
 * understandProduct() / generateIcp() pipeline the dashboard's product/ICP pages already
 * use -- no parallel "onboarding-only" AI path. understandProduct() requires a website
 * (it researches the product from there now), which is why onboarding collects one
 * up front alongside the description, on the same first screen. Errors are caught and
 * returned as state (rather than thrown) for the same reason
 * lib/actions/ai-action-state.ts's runAiAction exists: Next.js redacts a thrown Server
 * Action error's message in production.
 */
export async function runOnboardingAction(
  _prevState: OnboardingActionState,
  formData: FormData,
): Promise<OnboardingActionState> {
  const productDescription = String(formData.get("productDescription") ?? "").trim();
  const website = String(formData.get("website") ?? "").trim();
  const targetAudience = String(formData.get("targetAudience") ?? "").trim();

  if (!productDescription) {
    return { error: "Tell us what you're building first." };
  }
  if (!website) {
    return { error: "Tell us where we can see it live -- the profile is researched from your website." };
  }
  if (!targetAudience) {
    return { error: "Tell us who you think needs it." };
  }

  try {
    const accountId = String(formData.get("accountId") ?? "");
    const name = deriveName(productDescription);

    const business = await createBusiness(accountId, { name });
    const product = await createProduct(business.id, { name, website });

    const workspace = await getWorkspaceForProduct(product.id);
    if (!workspace) throw new Error("Workspace not found for the new product.");

    await addKnowledgeSource(workspace.id, {
      sourceType: "manual",
      sourceName: "Founder description",
      content: `What we're building:\n${productDescription}\n\nWho we think needs it:\n${targetAudience}`,
    });

    const profile = await understandProduct(product.id);
    const icp = await generateIcp(product.id);

    return {
      data: {
        businessId: business.id,
        productId: product.id,
        icpId: icp.id,
        profile,
        icp,
      },
    };
  } catch (error) {
    unstable_rethrow(error);
    return { error: error instanceof Error ? error.message : "Something went wrong." };
  }
}

export async function approveOnboardingIcpAction(icpId: string): Promise<{ error: string } | null> {
  try {
    await approveIcpProfile(icpId);
    return null;
  } catch (error) {
    unstable_rethrow(error);
    return { error: error instanceof Error ? error.message : "Something went wrong." };
  }
}
