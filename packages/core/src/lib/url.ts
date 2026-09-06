/**
 * Prepends https:// to a scheme-less URL/domain (e.g. "acme.com" -> "https://acme.com").
 * Every URL-ish input in the app is type="text", not type="url"
 * (docs/prospects-pipeline-redesign-requirements.md R13) -- the browser never rejects a
 * bare domain, so this is the one place that leniency has to be handled server-side.
 * Already-absolute URLs pass through untouched.
 */
export function normalizeUrl(url: string): string {
  const trimmed = url.trim();
  return trimmed.startsWith("http") ? trimmed : `https://${trimmed}`;
}
