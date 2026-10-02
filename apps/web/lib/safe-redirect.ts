/**
 * A post-auth destination taken from the URL (`?next=`), reduced to a path on this site.
 *
 * `next` is attacker-controllable, and gluing it onto the origin is not safe on its own:
 * `next=@evil.example` turns `https://app.example.com` + `@evil.example` into a URL whose
 * host is evil.example (everything before the `@` becomes userinfo). So it is accepted
 * only as a same-origin absolute path -- one leading `/`, not `//` or `/\` (both of which
 * browsers read as another host), no scheme, no control characters -- and anything else
 * falls back.
 */
export function safeRedirectPath(next: string | null | undefined, fallback = "/dashboard"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  if (/[\u0000-\u001f\u007f\\]/.test(next)) return fallback;
  try {
    const base = "https://internal.invalid";
    const url = new URL(next, base);
    if (url.origin !== base) return fallback;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return fallback;
  }
}
