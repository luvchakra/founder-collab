"use server";

import { revalidatePath } from "next/cache";
import { publishLegalVersion, type PublishLegalVersionInput } from "@cofounderai/core/admin/platform-legal";
import { legalContentHash } from "@/lib/legal-hash";

// PLATFORM-P1-09.1: the content hash comes from the text this deployment serves, never from
// the browser; core checks superadmin and validates, the database audits.
export async function publishLegalVersionAction(input: PublishLegalVersionInput) {
  if (input.document !== "terms" && input.document !== "privacy") return { ok: false as const, error: "Unknown document." };
  const result = await publishLegalVersion(input, legalContentHash(input.document));
  if (result.ok) {
    revalidatePath("/platform/legal");
    revalidatePath("/platform/audit");
  }
  return result;
}
