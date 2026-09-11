"use server";

import { revalidatePath } from "next/cache";
import { recordAssessmentOutcome } from "@cofounderai/module-fsm/lib/assessments/mutations";
import type { AssessmentOutcome } from "@cofounderai/module-fsm/lib/assessments/types";

function assessmentPath(businessId: string, assessmentId: string) {
  return `/dashboard/businesses/${businessId}/fsm/assessments/${assessmentId}`;
}

/** INT-04.3's outcome-recording form action. */
export async function recordAssessmentOutcomeAction(businessId: string, assessmentId: string, formData: FormData): Promise<void> {
  const outcome = String(formData.get("outcome") || "") as AssessmentOutcome;
  if (!outcome) return;
  const notes = String(formData.get("outcomeNotes") || "") || null;
  await recordAssessmentOutcome(businessId, assessmentId, outcome, notes);
  revalidatePath(assessmentPath(businessId, assessmentId));
}
