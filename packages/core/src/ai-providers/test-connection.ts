import type { AiProvider } from "../ai/model-registry";

export type ConnectionTestResult = { ok: true } | { ok: false; error: string };

/**
 * Validates a newly entered API key with the minimum possible cost
 * (docs/byok-ai-requirements.md §7): a provider's model-listing REST endpoint, never an
 * LLM generation call. The key is only ever sent to the provider it belongs to, never
 * logged, and never included in a thrown error message.
 */
export async function testProviderConnection(
  provider: AiProvider,
  apiKey: string,
): Promise<ConnectionTestResult> {
  let response: Response;
  try {
    response = await fetchModelListing(provider, apiKey);
  } catch {
    return { ok: false, error: "Could not reach the provider. Check your network and try again." };
  }

  if (response.ok) return { ok: true };
  if (response.status === 401 || response.status === 403) {
    return { ok: false, error: "That API key was rejected by the provider." };
  }
  if (response.status === 429) {
    return { ok: false, error: "The provider rate-limited this request. Try again shortly." };
  }
  return { ok: false, error: `Provider returned an unexpected error (HTTP ${response.status}).` };
}

function fetchModelListing(provider: AiProvider, apiKey: string): Promise<Response> {
  const signal = AbortSignal.timeout(10_000);
  switch (provider) {
    case "openai":
      return fetch("https://api.openai.com/v1/models", {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal,
      });
    case "anthropic":
      return fetch("https://api.anthropic.com/v1/models", {
        headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
        signal,
      });
    case "google":
      // Header form (rather than the ?key= query param) so the key never ends up in a
      // URL that might get logged.
      return fetch("https://generativelanguage.googleapis.com/v1beta/models", {
        headers: { "x-goog-api-key": apiKey },
        signal,
      });
  }
}
