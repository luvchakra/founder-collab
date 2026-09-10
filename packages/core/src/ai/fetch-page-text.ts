/**
 * A plain server-side fetch of one page, with every link preserved as an inline
 * "label [absolute-url]" annotation. module-discovery/lib/ai/research-website.ts tries
 * this first for any website-research step, ahead of a provider's own URL-retrieval tool
 * (provider-factory.ts#createUrlContextTools) -- see that file's own doc comment for why:
 * a provider's tool call paraphrases the page instead of returning it, which reliably
 * drops exactly the kind of per-product link this exists to find, and costs an LLM call
 * this skips on the common path. It also covers the case that used to be this function's
 * whole purpose -- some sites block a specific AI provider's crawler (its user-agent or IP
 * range, or a WAF/CDN challenge that only triggers for non-browser-like requests) while
 * serving an ordinary request fine, and there is no lever this app can pull to change
 * Gemini's/OpenAI's/Anthropic's own crawler behavior.
 *
 * Deliberately not a full HTML parser (no new dependency, per this repo's own "don't add
 * a dependency unless necessary") -- this strips markup down to plain text with regexes,
 * which is good enough input for a structuring prompt that's already tolerant of messy
 * text. It won't handle a page whose content only renders after client-side JavaScript
 * runs; callers should word their own error message for that case, same as they already
 * do for the provider-tool path.
 */
export async function fetchPageText(url: string): Promise<string> {
  let response: Response;
  try {
    response = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(15000),
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Direct fetch of ${url} failed (${detail}).`);
  }

  if (!response.ok) {
    throw new Error(`Direct fetch of ${url} returned HTTP ${response.status}.`);
  }

  const html = await response.text();
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    // Rewrites every anchor to "label [absolute-url]" *before* the generic tag-strip
    // below discards it -- a plain-text dump with every href thrown away is useless for
    // discover-products.ts's per-product page URLs (its whole point is finding each
    // product's own link), which is exactly what stripping tags outright used to do.
    // Resolved against `url` so a relative href (the overwhelmingly common case for an
    // internal product link) still becomes a real, usable URL.
    .replace(/<a\s+(?:[^>]*?\s)?href=["']([^"'#][^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi, (_match, href: string, inner: string) => {
      if (/^(javascript|mailto|tel):/i.test(href)) return inner;
      let absolute: string;
      try {
        absolute = new URL(href, url).toString();
      } catch {
        return inner;
      }
      const label = inner.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
      return label ? `${label} [${absolute}]` : ` ${absolute} `;
    })
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();

  if (!text) {
    throw new Error(`Direct fetch of ${url} succeeded but the page had no extractable text (likely rendered by client-side JavaScript).`);
  }

  // Bounds the prompt this feeds into -- a structuring call needs the gist of the page,
  // not every byte of it, and an unbounded page could otherwise blow past the model's
  // context window on a large/JS-bundle-heavy site. Raised from the original 20000 to
  // give the now-inline "[url]" annotations room without crowding out the surrounding
  // product text that makes them identifiable.
  return text.slice(0, 30000);
}
