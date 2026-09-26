import { BillingProviderError, type BillingProviderKey } from "../subscription-types";

/**
 * BILL-02 -- the one way billing talks to a provider: HTTPS with a timeout, and failures
 * turned into BillingProviderError carrying only an error code and the provider's own
 * short description -- never request headers, credentials or the full response (§97).
 * No SDKs: both providers' REST APIs are small enough to call directly, and this keeps the
 * existing Razorpay credit code's approach (core/billing/razorpay.ts).
 */
const TIMEOUT_MS = 15_000;

export async function providerRequest<T>(
  provider: BillingProviderKey,
  operation: string,
  url: string,
  init: RequestInit,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "AbortError";
    throw new BillingProviderError(provider, operation, timedOut ? "timeout" : "network_error", timedOut ? "The payment provider did not respond in time." : "Could not reach the payment provider.");
  } finally {
    clearTimeout(timer);
  }
  const text = await response.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }
  if (!response.ok) {
    const err = (body as { error?: { code?: string; type?: string; message?: string; description?: string } } | null)?.error;
    const code = err?.code ?? err?.type ?? `http_${response.status}`;
    const message = (err?.message ?? err?.description ?? `The payment provider rejected the request (${response.status}).`).slice(0, 300);
    throw new BillingProviderError(provider, operation, code, message, response.status);
  }
  return body as T;
}

/** Currencies whose amounts carry no minor unit at Stripe (https://docs.stripe.com/currencies). */
const ZERO_DECIMAL = new Set(["BIF", "CLP", "DJF", "GNF", "JPY", "KMF", "KRW", "MGA", "PYG", "RWF", "UGX", "VND", "VUV", "XAF", "XOF", "XPF"]);

export function fromMinorUnits(amount: number | null | undefined, currency: string): number | null {
  if (amount == null) return null;
  return ZERO_DECIMAL.has(currency.toUpperCase()) ? amount : amount / 100;
}

export function toMinorUnits(amount: number, currency: string): number {
  return ZERO_DECIMAL.has(currency.toUpperCase()) ? Math.round(amount) : Math.round(amount * 100);
}

export const isoFromUnix = (seconds: number | null | undefined): string | null =>
  seconds == null || seconds === 0 ? null : new Date(seconds * 1000).toISOString();
