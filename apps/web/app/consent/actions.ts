"use server";

import { redirect } from "next/navigation";
import { createClient } from "@cofounderai/core/db/server";
import { recordConsent } from "@cofounderai/core/privacy/consent";
import { safeRedirectPath } from "@cofounderai/core/security/safe-redirect";

export type ConsentFormState = { error: string } | null;

export async function acceptNoticeAction(_prev: ConsentFormState, formData: FormData): Promise<ConsentFormState> {
  if (formData.get("acceptPrivacy") !== "on") {
    return { error: "Please confirm you've read the privacy notice and are 18 or older." };
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  await recordConsent(user.id, "terms_privacy", true, "reconsent");
  await recordConsent(user.id, "marketing_communications", formData.get("marketingConsent") === "on", "reconsent");
  redirect(safeRedirectPath(String(formData.get("next") ?? ""), "/dashboard"));
}
