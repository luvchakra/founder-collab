/**
 * DISC-OFFER-P0-09.2's own "Respect access/robots restrictions." A minimal, standards-
 * enough robots.txt reader -- no new dependency (CLAUDE.md dev principle #2): this only
 * ever needs a flat list of `Disallow` prefixes for one user-agent group, not the full
 * spec (crawl-delay, sitemap directives, wildcard/`$` path matching are all out of scope
 * for a same-domain crawl bounded to a handful of pages).
 *
 * Parsing itself (parseRobotsTxt/isPathAllowed) is pure and deterministic (dev principle
 * #4); fetchRobotsRules is the one network-touching, best-effort wrapper around it.
 */

const AGENT_TOKEN = "cofounderai";

export type RobotsRules = { disallow: string[] };

/**
 * Parses robots.txt into the effective Disallow list for our own agent -- falling back to
 * the wildcard `User-agent: *` group when no group names our own token specifically (the
 * overwhelming common case). Groups are separated by `User-agent:` lines; only `Disallow`
 * lines are read (an `Allow` override is a corner case this minimal reader doesn't need to
 * get exactly right for a same-domain, human-curated-looking page list).
 */
export function parseRobotsTxt(text: string, agentToken: string = AGENT_TOKEN): RobotsRules {
  const lines = text.split(/\r?\n/).map((line) => line.replace(/#.*$/, "").trim());

  type Group = { agents: string[]; disallow: string[] };
  const groups: Group[] = [];
  let current: Group | null = null;

  for (const line of lines) {
    if (!line) continue;
    const [rawKey, ...rest] = line.split(":");
    if (!rawKey || rest.length === 0) continue;
    const key = rawKey.trim().toLowerCase();
    const value = rest.join(":").trim();

    if (key === "user-agent") {
      if (!current || current.disallow.length > 0) {
        current = { agents: [value.toLowerCase()], disallow: [] };
        groups.push(current);
      } else {
        current.agents.push(value.toLowerCase());
      }
    } else if (key === "disallow" && current) {
      if (value) current.disallow.push(value);
    }
  }

  const named = groups.find((g) => g.agents.some((a) => a !== "*" && agentToken.toLowerCase().includes(a)));
  if (named) return { disallow: named.disallow };

  const wildcard = groups.find((g) => g.agents.includes("*"));
  return { disallow: wildcard?.disallow ?? [] };
}

/** True unless `path` starts with one of the disallowed prefixes -- the same simple
 * prefix-match rule robots.txt's own spec defines for a plain (non-wildcard) Disallow
 * value, which is all `parseRobotsTxt` ever collects. */
export function isPathAllowed(rules: RobotsRules, path: string): boolean {
  return !rules.disallow.some((prefix) => prefix !== "" && path.startsWith(prefix));
}

/**
 * Best-effort robots.txt fetch for one origin. Absent, unreachable, or non-2xx is treated
 * as "no restrictions" -- the same permissive default most real crawlers use for a missing
 * robots.txt, and consistent with this feature's own bias (09.1) toward a direct fetch
 * failing open rather than blocking the whole run over a secondary concern.
 */
export async function fetchRobotsRules(origin: string): Promise<RobotsRules> {
  try {
    const response = await fetch(new URL("/robots.txt", origin).toString(), {
      signal: AbortSignal.timeout(5000),
      headers: { "User-Agent": "Mozilla/5.0 (compatible; CofounderAI-Onboarding/1.0)" },
    });
    if (!response.ok) return { disallow: [] };
    return parseRobotsTxt(await response.text());
  } catch {
    return { disallow: [] };
  }
}
