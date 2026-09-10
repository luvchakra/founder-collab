/**
 * Last-resort fallback for when a provider's own URL-retrieval tool
 * (provider-factory.ts#createUrlContextTools) fails or comes back empty. Some sites block
 * a specific AI provider's crawler (its user-agent or IP range, or a WAF/CDN bot challenge
 * that only triggers for non-browser-like requests) while serving an ordinary request
 * fine -- there is no lever this app can pull to change Gemini's/OpenAI's/Anthropic's own
 * crawler behavior, but a plain server-side fetch with a normal browser User-Agent is a
 * different network path and often succeeds where the provider's tool didn't.
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
  // context window on a large/JS-bundle-heavy site.
  return text.slice(0, 20000);
}
