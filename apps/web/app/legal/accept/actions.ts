"use server";

import { acceptLegalVersions } from "@cofounderai/core/privacy/legal-acceptance";

// PLATFORM-P1-09.4: the signed-in user accepts the versions shown to them. The database
// accepts only active versions, only for the caller, and only once.
export async function acceptLegalVersionsAction(versionIds: string[]): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!Array.isArray(versionIds) || versionIds.length === 0 || versionIds.some((id) => typeof id !== "string")) {
    return { ok: false, error: "Nothing to accept. Reload the page." };
  }
  try {
    await acceptLegalVersions(versionIds);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Your acceptance wasn't recorded. Try again." };
  }
}
