export type NormalizeWebsiteUrlResult = { ok: true; url: string } | { ok: false; error: string };

/**
 * DISC-OFFER-P0-09.1's own "URL is validated and normalized" acceptance criterion, and
 * §26's "Invalid URL -- We couldn't recognize this website address." failure state.
 * Pure and deterministic (CLAUDE.md dev principle #4) -- no AI call belongs in telling a
 * malformed string from a real address.
 *
 * A bare scheme-less input ("example.com") is accepted and defaulted to https:// --
 * that's the same "type in a domain, not a full URL" affordance both the existing
 * `createBusinessFromWebsiteAction` and `CreateBusinessModal`'s own placeholder
 * ("https://example.com") already assume. Beyond that, this is deliberately strict:
 * only http/https, and a hostname that actually looks like one (has a dot, so a bare
 * word like "asdf" is rejected as unrecognizable rather than silently treated as a
 * single-label hostname) -- a business's public website is never expected to be
 * "localhost" or a bare intranet name.
 */
export function normalizeWebsiteUrl(input: string): NormalizeWebsiteUrlResult {
  const trimmed = input.trim();
  if (!trimmed) {
    return { ok: false, error: "A website address is required." };
  }

  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

  let parsed: URL;
  try {
    parsed = new URL(withScheme);
  } catch {
    return { ok: false, error: "We couldn't recognize this website address." };
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { ok: false, error: "We couldn't recognize this website address." };
  }

  const hostname = parsed.hostname.toLowerCase();
  if (!hostname.includes(".") || hostname.startsWith(".") || hostname.endsWith(".")) {
    return { ok: false, error: "We couldn't recognize this website address." };
  }

  const path = parsed.pathname === "/" ? "" : parsed.pathname.replace(/\/+$/, "");
  const normalized = `${parsed.protocol}//${hostname}${parsed.port ? `:${parsed.port}` : ""}${path}`;
  return { ok: true, url: normalized };
}
