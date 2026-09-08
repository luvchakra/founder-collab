"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@cofounderai/core/rbac/require-permission";
import { createJob } from "@cofounderai/module-fsm/lib/jobs/mutations";
import type { CreateJobActionState } from "@cofounderai/module-fsm/components/jobs/create-job-dialog";

function jobsPath(businessId: string) {
  return `/dashboard/businesses/${businessId}/fsm/jobs`;
}

export async function createJobAction(businessId: string, _prevState: CreateJobActionState, formData: FormData): Promise<CreateJobActionState> {
  try {
    await requirePermission(businessId, "jobs.edit");

    const partyId = String(formData.get("party_id") ?? "").trim();
    const newCustomerName = String(formData.get("new_customer_name") ?? "").trim();

    const id = await createJob(businessId, {
      partyId: partyId || undefined,
      newCustomer: newCustomerName
        ? {
            name: newCustomerName,
            email: String(formData.get("new_customer_email") ?? "").trim() || undefined,
            phone: String(formData.get("new_customer_phone") ?? "").trim() || undefined,
          }
        : undefined,
      serviceTypeId: String(formData.get("service_type_id") ?? "").trim() || null,
      description: String(formData.get("description") ?? "").trim(),
      scopeOfWork: String(formData.get("scope_of_work") ?? "").trim(),
    });

    revalidatePath(jobsPath(businessId));
    return { success: true, id };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not create job." };
  }
}
