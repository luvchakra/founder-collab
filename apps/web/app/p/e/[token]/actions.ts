"use server";

import { approveEstimateByToken, declineEstimateByToken } from "@cofounderai/module-fsm/lib/estimates/mutations";

// Both take the raw token from the URL, never a business/document id -- there is no
// session on this public page, so the token itself (validated inside these mutations via
// resolvePortalToken) is the only authorization.
export async function approveEstimatePublicAction(rawToken: string): Promise<{ jobId: string }> {
  return approveEstimateByToken(rawToken);
}

export async function declineEstimatePublicAction(rawToken: string): Promise<void> {
  return declineEstimateByToken(rawToken);
}
