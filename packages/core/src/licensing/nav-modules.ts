import type { ShellNavModule } from "../components/shell/types";

/** The minimum a module manifest must expose to appear in navigation. */
export interface NavigableModule {
  key: string;
  name: string;
  icon: string;
  routePrefix: string;
}

export const DEFAULT_UPSELL_HREF = "/dashboard/settings/licenses";

/**
 * Layer 4 of licensing's four required enforcement layers (00-MASTER-PLAN.md): navigation
 * is "built from `module-registry` filtered by entitlements", where an unlicensed module
 * "renders as an upsell card, never as a broken link".
 *
 * `licensedKeys` is the active business's entitlement set. Passing `null` means there is
 * no active business to check against (e.g. `/dashboard` itself, before one is selected)
 * — every module then renders as a normal link, because "not licensed" is not yet a
 * meaningful claim. An empty set is different from `null`: it means a business IS active
 * and has licensed nothing, so every module renders as an upsell.
 *
 * A module's own route is only ever handed out when it is licensed; an unlicensed one
 * points at the licences settings page instead. That keeps this layer consistent with
 * layer 2, which 404s the module route outright — the nav never offers a link that the
 * route guard would reject.
 */
export function buildNavModules(
  modules: readonly NavigableModule[],
  licensedKeys: ReadonlySet<string> | null,
  options: { upsellHref?: string; businessHref?: (routePrefix: string) => string } = {},
): ShellNavModule[] {
  const upsellHref = options.upsellHref ?? DEFAULT_UPSELL_HREF;

  return modules.map((module) => {
    const licensed = licensedKeys === null || licensedKeys.has(module.key);
    return {
      key: module.key,
      name: module.name,
      icon: module.icon,
      routePrefix: licensed
        ? (options.businessHref?.(module.routePrefix) ?? module.routePrefix)
        : upsellHref,
      licensed,
    };
  });
}

/**
 * Entitlement set for one business out of a `businessId -> module keys` map, or `null`
 * when there is no active business. Kept beside `buildNavModules` because the "no active
 * business" case is the one callers get wrong.
 */
export function licensedKeysFor(
  licensedByBusiness: Record<string, string[]>,
  activeBusinessId: string | null | undefined,
): ReadonlySet<string> | null {
  if (!activeBusinessId) return null;
  return new Set(licensedByBusiness[activeBusinessId] ?? []);
}
