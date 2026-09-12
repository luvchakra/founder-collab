import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { moduleRegistry } from "@cofounderai/module-registry";

/** `/dashboard` is the customer app; `/platform` (PLATFORM-P0-01.2, "every /platform/*
 * route... must independently verify authenticated user AND platform-level
 * authorization") is the WonderArc control plane -- both need the same auth wall
 * (redirect to /login when signed out), but only `/dashboard` ever resolves a business
 * id below: PLATFORM-P0-01.4's "No Tenant Context Required" holds for free, since no
 * `/platform/*` path matches the business-scoped regex that block depends on. */
const PROTECTED_PREFIXES = ["/dashboard", "/platform"];
const AUTH_PATHS = new Set(["/login", "/signup"]);

/** Pure prefix check, its own function for the same reason `activeBusinessIdFromPath()`
 * is -- testable without constructing a real NextRequest. */
export function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

/** Business id embedded in the URL -- .../dashboard/businesses/[id]/... today, the only
 * route shape that exists. Kept as its own function (rather than inlined into the
 * business-scoped regex below) so it only needs updating in one place once a
 * [businessSlug] segment exists. */
export function activeBusinessIdFromPath(pathname: string): string | null {
  return pathname.match(/\/dashboard\/businesses\/([^/]+)/)?.[1] ?? null;
}

function escapeForRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Which module (if any) `pathname` belongs to -- independent of licensing or the
 * platform-wide kill switch, just route-shape matching. Checked against two shapes:
 * today's /dashboard/businesses/[id]/<prefix>/... (a module's own routes living alongside
 * discovery's /products/...) and a bare /<prefix> prefix (the eventual
 * [businessSlug]/<prefix> shape module-registry's own routePrefix docstring names as the
 * target). Factored out of `findUnlicensedModuleForRoute()` (PLATFORM-P0-07.2) so
 * `findPlatformDisabledModuleForRoute()` below can share the exact same route-matching
 * logic instead of re-deriving it. */
function moduleForRoute(pathname: string): (typeof moduleRegistry)[number] | null {
  for (const module of moduleRegistry) {
    const prefix = escapeForRegex(module.routePrefix);
    const businessScoped = new RegExp(`^/dashboard/businesses/[^/]+${prefix}(?:/|$)`);
    const topLevel = new RegExp(`^${prefix}(?:/|$)`);
    if (businessScoped.test(pathname) || topLevel.test(pathname)) return module;
  }
  return null;
}

/**
 * The key of the module `pathname` belongs to, if the active business hasn't licensed
 * it -- null otherwise. CLAUDE.md's architecture section lists this route guard as one
 * of licensing's four required enforcement layers (RLS, this, requireModule(), UI
 * filtered by entitlements).
 *
 * Returns the module key (not just a boolean) since 2026-09-09 -- the caller renders an
 * informative "not licensed" page naming the module and the reason, rather than a bare
 * 404 (docs/testing/test-cases/menu-smoke.md's TC-MENU-LIC-001/002, refined to spec this
 * exact page instead of the "undefined behavior" this route guard previously left it at).
 */
export function findUnlicensedModuleForRoute(pathname: string, licensedModules: Set<string>): string | null {
  const module = moduleForRoute(pathname);
  if (module && !licensedModules.has(module.key)) return module.key;
  return null;
}

/** Back-compat boolean form of `findUnlicensedModuleForRoute()` -- kept for
 * `middleware.test.ts`'s existing cases and any other caller that only needs the
 * yes/no answer, not which module. */
export function isUnlicensedModuleRoute(pathname: string, licensedModules: Set<string>): boolean {
  return findUnlicensedModuleForRoute(pathname, licensedModules) !== null;
}

/**
 * PLATFORM-P0-07.2/07.3 -- the key of the module `pathname` belongs to, if a superadmin
 * has fully blocked it platform-wide (`platform.modules.status` is `disabled` OR
 * `maintenance` -- PLATFORM-P0-07.3 decision #3: the exact same full block, so both
 * populate `disabledModules` identically here) -- null otherwise. Deliberately
 * business-independent (unlike `findUnlicensedModuleForRoute()` above): a platform-wide
 * full block applies to every business regardless of that business's own license status,
 * so this check is not gated on the caller having any particular license at all. A
 * platform-wide `read_only` status is deliberately NOT included here (decision #2 --
 * mirrors a license's own grace period, which likewise never blocks the route itself,
 * only writes); it takes no route-guard action at all, the same way grace-period licenses
 * don't. Checked first in `updateSession()` below -- a platform-disabled module takes
 * priority over an ordinary licensing reason, since it is the more universal fact. */
export function findPlatformDisabledModuleForRoute(pathname: string, disabledModules: Set<string>): string | null {
  const module = moduleForRoute(pathname);
  if (module && disabledModules.has(module.key)) return module.key;
  return null;
}

/**
 * Refreshes the Supabase auth session cookie on every request and enforces the
 * authenticated/unauthenticated route boundary. Called from apps/web/proxy.ts.
 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Do not run any logic between createServerClient and getUser() -- it revalidates the
  // session token and must not be skipped, or sessions can appear valid after they've
  // been revoked.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isProtected = isProtectedPath(pathname);
  const isAuthPath = AUTH_PATHS.has(pathname);

  if (!user && isProtected) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (user && isAuthPath) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  // Business/entitlement resolution: only meaningful once there's a signed-in user on a
  // protected, business-scoped route. Loaded once here (a single query) rather than
  // leaving every module route to resolve its own licensed-module set.
  if (user && isProtected) {
    const businessId = activeBusinessIdFromPath(pathname);
    if (businessId) {
      const coreClient = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
        {
          db: { schema: "core" },
          cookies: {
            getAll() {
              return request.cookies.getAll();
            },
            // Read-only client for this one query -- session cookie refresh is already
            // fully owned by `supabase` above; this must not also try to write cookies.
            setAll() {},
          },
        },
      );
      const platformClient = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
        {
          db: { schema: "platform" },
          cookies: {
            getAll() {
              return request.cookies.getAll();
            },
            setAll() {},
          },
        },
      );
      const [{ data: licenses }, { data: platformModules }] = await Promise.all([
        coreClient.from("licenses").select("module_key, status, grace_ends_at").eq("business_id", businessId),
        // PLATFORM-P0-07.2/07.3: platform.modules' own SELECT policy is open to any
        // authenticated user (see that migration's own docstring), so this read works for
        // an ordinary business member's session, not just a superadmin's. `status` (not
        // the old boolean `enabled`, which PLATFORM-P0-07.3's reconciliation made a
        // derived, database-generated column) is the source of truth from here on.
        platformClient.from("modules").select("module_key, status, customer_facing_message"),
      ]);
      const licensedModules = new Set(
        (licenses ?? []).filter((l) => l.status === "active" || l.status === "grace").map((l) => l.module_key as string),
      );
      const platformStatusByKey = new Map(
        (platformModules ?? []).map((m) => [
          m.module_key as string,
          { status: m.status as string, message: m.customer_facing_message as string | null },
        ]),
      );
      // PLATFORM-P0-07.3 decision #3: `maintenance` and `disabled` are the exact same
      // full block -- both populate this set identically. A platform-wide `read_only`
      // status (decision #2) deliberately does NOT block the route, mirroring how a
      // license's own grace period never blocks the route either -- only writes.
      const platformDisabledModules = new Set(
        [...platformStatusByKey.entries()]
          .filter(([, v]) => v.status === "disabled" || v.status === "maintenance")
          .map(([key]) => key),
      );

      // Platform-wide full block checked first -- it blocks every business regardless of
      // that business's own license status, so it is the more universal fact when both
      // would otherwise apply.
      const platformDisabledKey = findPlatformDisabledModuleForRoute(pathname, platformDisabledModules);
      if (platformDisabledKey) {
        const info = platformStatusByKey.get(platformDisabledKey);
        const url = request.nextUrl.clone();
        url.pathname = `/dashboard/businesses/${businessId}/not-licensed`;
        url.search = "";
        url.searchParams.set("module", platformDisabledKey);
        url.searchParams.set("reason", "platform_disabled");
        url.searchParams.set("platformStatus", info?.status ?? "disabled");
        if (info?.message) url.searchParams.set("message", info.message);
        return NextResponse.rewrite(url);
      }

      const blockedModuleKey = findUnlicensedModuleForRoute(pathname, licensedModules);
      if (blockedModuleKey) {
        const license = (licenses ?? []).find((l) => l.module_key === blockedModuleKey);
        const url = request.nextUrl.clone();
        url.pathname = `/dashboard/businesses/${businessId}/not-licensed`;
        url.search = "";
        url.searchParams.set("module", blockedModuleKey);
        url.searchParams.set("reason", license?.status ?? "none");
        if (license?.status === "grace" && license.grace_ends_at) {
          url.searchParams.set("graceEndsAt", license.grace_ends_at as string);
        }
        return NextResponse.rewrite(url);
      }
    }
  }

  return supabaseResponse;
}
