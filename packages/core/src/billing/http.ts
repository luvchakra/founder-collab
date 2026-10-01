import { GatewayError, type GatewayProvider } from "./types";

const TIMEOUT_MS = 15_000;

/** fetch with a timeout and provider-error normalization. Provider error bodies are
 * surfaced by message only -- never the request (which carries credentials). */
export async function gatewayRequest<T>(
  provider: GatewayProvider,
  url: string,
  init: RequestInit,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS), cache: "no-store" });
  } catch (error) {
    throw new GatewayError(
      `${provider} request failed: ${error instanceof Error ? error.message : String(error)}`,
      provider,
    );
  }
  const body = (await response.json().catch(() => null)) as
    | (T & { error?: { message?: string; description?: string } })
    | null;
  if (!response.ok || !body) {
    const message = body?.error?.message ?? body?.error?.description ?? `HTTP ${response.status}`;
    throw new GatewayError(`${provider}: ${message}`, provider, response.status);
  }
  return body;
}
