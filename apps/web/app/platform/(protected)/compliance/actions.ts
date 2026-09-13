"use server";

import { revalidatePath } from "next/cache";
import {
  createComplianceCountry,
  createCompliancePack,
  setComplianceCountryEnabled,
  updateComplianceCountry,
  updateCompliancePack,
  type CreateComplianceCountryInput,
  type CreateCompliancePackInput,
  type UpdateComplianceCountryInput,
  type UpdateCompliancePackInput,
} from "@cofounderai/core/admin/platform-compliance";

export async function createComplianceCountryAction(
  input: CreateComplianceCountryInput,
): ReturnType<typeof createComplianceCountry> {
  const result = await createComplianceCountry(input);
  if (result.ok) revalidatePath("/platform/compliance");
  return result;
}

export async function updateComplianceCountryAction(
  code: string,
  input: UpdateComplianceCountryInput,
): ReturnType<typeof updateComplianceCountry> {
  const result = await updateComplianceCountry(code, input);
  if (result.ok) revalidatePath("/platform/compliance");
  return result;
}

export async function setComplianceCountryEnabledAction(
  code: string,
  enabled: boolean,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const result = await setComplianceCountryEnabled(code, enabled);
  if (result.ok) revalidatePath("/platform/compliance");
  return result;
}

export async function createCompliancePackAction(
  input: CreateCompliancePackInput,
): ReturnType<typeof createCompliancePack> {
  const result = await createCompliancePack(input);
  if (result.ok) revalidatePath("/platform/compliance");
  return result;
}

export async function updateCompliancePackAction(
  id: string,
  input: UpdateCompliancePackInput,
): ReturnType<typeof updateCompliancePack> {
  const result = await updateCompliancePack(id, input);
  if (result.ok) revalidatePath("/platform/compliance");
  return result;
}
