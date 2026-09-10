"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createBusiness, createProduct, updateBusiness } from "@cofounderai/module-discovery/lib/tenancy/mutations";
import { understandBusiness } from "@cofounderai/module-discovery/lib/ai/understand-business";

export async function createBusinessAction(accountId: string, formData: FormData) {
  const business = await createBusiness(accountId, {
    name: String(formData.get("name") ?? ""),
    description: String(formData.get("description") ?? ""),
    website: String(formData.get("website") ?? ""),
    industry: String(formData.get("industry") ?? ""),
  });
  revalidatePath("/dashboard");
  redirect(`/dashboard/businesses/${business.id}`);
}

/**
 * "Create from website" tab of CreateBusinessModal -- founder gives just a website,
 * gets a business back with its real name/description AI-populated. Creates the business
 * first (from a placeholder name derived from the domain) rather than researching
 * beforehand: understandBusiness() logs through core.ai_runs at the business_id grain
 * (see its own doc comment for why), so it needs a real business row to attribute usage
 * to. Auto-populate is best-effort -- a research/AI failure still leaves a real business
 * behind (with its placeholder name), just not yet enriched; the founder lands on its
 * Business detail page either way and can fill in anything AI didn't get to.
 */
export async function createBusinessFromWebsiteAction(accountId: string, formData: FormData) {
  const rawWebsite = String(formData.get("website") ?? "").trim();
  if (!rawWebsite) throw new Error("A website is required.");
  const website = /^https?:\/\//i.test(rawWebsite) ? rawWebsite : `https://${rawWebsite}`;

  let placeholderName: string;
  try {
    placeholderName = new URL(website).hostname.replace(/^www\./, "");
  } catch {
    throw new Error("That doesn't look like a valid website.");
  }

  const business = await createBusiness(accountId, { name: placeholderName, website });

  try {
    const profile = await understandBusiness(business.id, accountId, website);
    await updateBusiness(business.id, { name: profile.name, description: profile.description });
  } catch (err) {
    console.error("createBusinessFromWebsiteAction: auto-populate failed, business created with placeholder name", err);
  }

  revalidatePath("/dashboard");
  redirect(`/dashboard/businesses/${business.id}/business`);
}

export async function createProductAction(businessId: string, formData: FormData) {
  const product = await createProduct(businessId, {
    name: String(formData.get("name") ?? ""),
    website: String(formData.get("website") ?? ""),
  });
  revalidatePath(`/dashboard/businesses/${businessId}`);
  redirect(`/dashboard/businesses/${businessId}/products/${product.id}`);
}
