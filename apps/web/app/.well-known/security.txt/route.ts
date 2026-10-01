import { SITE_URL } from "@cofounderai/core/site";

/**
 * RFC 9116 security.txt -- tells researchers where to report vulnerabilities (SECURITY.md).
 * Served from an env var rather than a static file so the contact isn't hardcoded into
 * the repo; 404 until SECURITY_CONTACT_EMAIL is configured.
 */
export function GET() {
  const contact = process.env.SECURITY_CONTACT_EMAIL;
  if (!contact) return new Response("Not found", { status: 404 });

  const expires = new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString();
  const body = [
    `Contact: mailto:${contact}`,
    `Expires: ${expires}`,
    "Preferred-Languages: en",
    `Canonical: ${SITE_URL}/.well-known/security.txt`,
    `Policy: ${SITE_URL}/privacy`,
    "",
  ].join("\n");
  return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
