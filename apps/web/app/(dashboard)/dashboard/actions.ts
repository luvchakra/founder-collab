"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createBusiness, createProduct } from "@cofounderai/module-discovery/lib/tenancy/mutations";

export async function createBusinessAction(accountId: string, formData: FormData) {
  const business = await createBusiness(accountId, {
    name: String(formData.get("name") ?? ""),
    website: String(formData.get("website") ?? ""),
    industry: String(formData.get("industry") ?? ""),
  });
  revalidatePath("/dashboard");
  redirect(`/dashboard/businesses/${business.id}`);
}

export async function createProductAction(businessId: string, formData: FormData) {
  const product = await createProduct(businessId, {
    name: String(formData.get("name") ?? ""),
    website: String(formData.get("website") ?? ""),
  });
  revalidatePath(`/dashboard/businesses/${businessId}`);
  redirect(`/dashboard/businesses/${businessId}/products/${product.id}`);
}
