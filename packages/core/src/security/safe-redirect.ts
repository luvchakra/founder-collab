/**
 * Returns `candidate` only if it is a same-origin, path-only redirect target -- otherwise
 * `fallback`. Guards every place a redirect destination arrives from a query string or
 * form field (e.g. auth/callback's `?next=`), which is otherwise an open redirect:
 * `${origin}${next}` with next="@evil.com" yields "https://app.example@evil.com", a URL
 * whose real host is evil.com; next="//evil.com" is a protocol-relative URL to evil.com.
 *
 * Accepted: a single leading "/" followed by anything that isn't a second "/" or "\"
 * (browsers normalize "\" to "/"), with no ASCII control characters or whitespace (a
 * leading tab/newline is stripped by the URL parser, turning "/\t/evil.com" into
 * "//evil.com").
 */
export function safeRedirectPath(candidate: string | null | undefined, fallback: string): string {
  if (!candidate) return fallback;
  if (!candidate.startsWith("/")) return fallback;
  if (candidate.startsWith("//") || candidate.startsWith("/\\")) return fallback;
  // eslint-disable-next-line no-control-regex
  if (/[\u0000- \u007f]/.test(candidate)) return fallback;
  return candidate;
}
