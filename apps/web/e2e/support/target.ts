/**
 * Where the E2E suite may point (docs/testing/what-runs-where.md): a local app and a local
 * Supabase stack, never production. The suite seeds accounts, flips licences and, with
 * E2E_ALLOW_MUTATIONS, writes business data, and the one hosted Supabase project serves
 * production, so playwright.config.ts refuses any other target before a test starts.
 *
 * A separate hosted project that is not production can be allowed with
 * E2E_REMOTE_IS_NOT_PRODUCTION=1; the production project and app never can.
 */

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "0.0.0.0", "[::1]", "::1", "host.docker.internal"]);
/** The production Supabase project and the production app's domain. */
const PRODUCTION = [/^jazdtomcgqjxjueedmck\./, /(^|\.)ark\.wonderapps\.biz$/];

function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

/** The reason the target is refused, or null when the suite may run against it. */
export function refuseTarget(input: { supabaseUrl?: string; baseUrl: string; remoteIsNotProduction?: boolean }): string | null {
  const targets: [string, string | undefined][] = [
    ["NEXT_PUBLIC_SUPABASE_URL", input.supabaseUrl],
    ["PLAYWRIGHT_BASE_URL", input.baseUrl],
  ];
  for (const [name, url] of targets) {
    if (!url) continue;
    const host = hostOf(url);
    if (!host) return `${name} is not a valid URL.`;
    if (LOCAL_HOSTS.has(host)) continue;
    if (PRODUCTION.some((re) => re.test(host))) return `${name} points at production (${host}). E2E runs against a local stack only.`;
    if (!input.remoteIsNotProduction) {
      return `${name} points at a hosted target (${host}). E2E runs against a local stack (npm run e2e:local); set E2E_REMOTE_IS_NOT_PRODUCTION=1 only for a separate project that holds no production data.`;
    }
  }
  return null;
}
