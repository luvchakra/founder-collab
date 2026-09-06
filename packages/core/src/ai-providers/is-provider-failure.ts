/**
 * Custom error properties (AiProviderError's `code`/`provider` from lib/ai/router.ts)
 * don't survive a thrown-error boundary crossing to the client -- only `.message` does,
 * and Next.js redacts even that in production unless the server action itself caught the
 * error and returned it as data (see lib/actions/ai-action-state.ts). So "is this an
 * AI/BYOK failure" is a heuristic over the message text, matching the fixed phrases
 * toAiProviderError always includes (e.g. "API key could not complete", "Connect an AI
 * provider", "hit a rate limit or quota cap").
 */
export function isAiProviderFailure(message: string): boolean {
  return /api key|ai provider|rate limit|quota|model .* isn't available|is currently unavailable|request to \w+ timed out/i.test(
    message,
  );
}
