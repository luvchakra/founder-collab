import { unstable_rethrow } from "next/navigation";

/**
 * Next.js redacts a thrown Server Action error's real message in production (replacing
 * it with a generic "An error occurred in the Server Components render" digest) -- so an
 * AI-invoking action can never let its error propagate as a thrown exception and expect
 * the founder to see anything useful. Returning it as state instead (the same pattern
 * app/(auth)/actions.ts already uses for login/signup) is the only way a specific
 * message -- like an AiProviderError from lib/ai/router.ts -- reaches the client.
 */
export type AiActionState = { error: string } | null;

/**
 * Wraps an AI-invoking action body: runs it, and converts a thrown error into
 * AiActionState instead of letting it cross the server/client boundary as an exception.
 *
 * unstable_rethrow first: redirect()/notFound() work by throwing a special Next.js
 * control-flow error, and a caller that follows discoverProspects() with a redirect()
 * needs that to keep propagating, not get swallowed here as if it were a real failure.
 */
export async function runAiAction(fn: () => Promise<unknown>): Promise<AiActionState> {
  try {
    await fn();
    return null;
  } catch (error) {
    unstable_rethrow(error);
    return { error: error instanceof Error ? error.message : "Something went wrong." };
  }
}
