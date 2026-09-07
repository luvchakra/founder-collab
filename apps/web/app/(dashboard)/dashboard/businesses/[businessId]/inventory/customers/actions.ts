"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@cofounderai/core/rbac/require-permission";
import {
  createCustomer,
  updateCustomer,
  setCustomerActive,
} from "@cofounderai/module-inventory/lib/customers/mutations";
import type { CustomerInput } from "@cofounderai/module-inventory/lib/customers/mutations";
import type { CustomerActionState } from "@cofounderai/module-inventory/components/customers/customer-modal";

function customersPath(businessId: string) {
  return `/dashboard/businesses/${businessId}/inventory/customers`;
}

type FormResult = { error: string } | { input: CustomerInput };

function readCustomerForm(formData: FormData): FormResult {
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "Name is required." };

  return {
    input: {
      name,
      gstin: String(formData.get("gstin") ?? "").trim() || null,
      phone: String(formData.get("phone") ?? "").trim() || null,
      email: String(formData.get("email") ?? "").trim() || null,
      billing_address: String(formData.get("billing_address") ?? "").trim() || null,
      shipping_address: String(formData.get("shipping_address") ?? "").trim() || null,
      state: String(formData.get("state") ?? "").trim() || null,
    },
  };
}

export async function createCustomerAction(
  businessId: string,
  _prevState: CustomerActionState,
  formData: FormData,
): Promise<CustomerActionState> {
  const parsed = readCustomerForm(formData);
  if ("error" in parsed) return parsed;

  try {
    await requirePermission(businessId, "customers.edit");
    await createCustomer(businessId, parsed.input);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not create customer." };
  }

  revalidatePath(customersPath(businessId));
  return { success: true };
}

export async function updateCustomerAction(
  businessId: string,
  customerId: string,
  _prevState: CustomerActionState,
  formData: FormData,
): Promise<CustomerActionState> {
  const parsed = readCustomerForm(formData);
  if ("error" in parsed) return parsed;

  try {
    await requirePermission(businessId, "customers.edit");
    await updateCustomer(customerId, parsed.input);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not save customer." };
  }

  revalidatePath(customersPath(businessId));
  return { success: true };
}

export async function toggleCustomerActiveAction(
  businessId: string,
  customerId: string,
  isActive: boolean,
): Promise<void> {
  await requirePermission(businessId, "customers.edit");
  await setCustomerActive(customerId, isActive);
  revalidatePath(customersPath(businessId));
}
