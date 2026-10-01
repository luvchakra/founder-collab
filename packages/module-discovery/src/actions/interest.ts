"use server";

import { headers } from "next/headers";
import { unstable_rethrow } from "next/navigation";
import { checkRateLimit, clientIp } from "@cofounderai/core/security/rate-limit";
import { recordInterestSignup } from "../lib/interest/mutations";
import { notifyInterestSignup } from "../lib/interest/notify";

export type ShowInterestState = { error: string } | { success: true } | null;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Backs the landing page's "Show Interest" modal (CoFounderAI UI & CTA Enhancement doc
 * §2-3). Errors are returned as state rather than thrown, matching every other
 * useActionState-backed action in this codebase (app/(auth)/actions.ts,
 * app/onboarding/actions.ts) -- Next.js redacts a thrown Server Action error's message in
 * production. */
export async function submitInterestAction(
  _prevState: ShowInterestState,
  formData: FormData,
): Promise<ShowInterestState> {
  const email = String(formData.get("email") ?? "").trim();

  if (!email) {
    return { error: "Enter your email to get notified." };
  }
  if (!EMAIL_PATTERN.test(email)) {
    return { error: "Enter a valid email address." };
  }

  try {
    // Anonymous endpoint that writes a row and emails the founder -- throttle per client
    // IP so it can't be used to flood either.
    const allowed = await checkRateLimit("interest-signup", clientIp(await headers()), {
      windowSeconds: 3600,
      max: 5,
    });
    if (!allowed) {
      return { error: "Too many attempts -- please try again later." };
    }

    const { isNew } = await recordInterestSignup(email);
    if (isNew) await notifyInterestSignup(email);
    return { success: true };
  } catch (error) {
    unstable_rethrow(error);
    console.error("[interest] submission failed:", error);
    return { error: "Something went wrong -- please try again." };
  }
}
