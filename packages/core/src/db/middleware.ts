import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { moduleRegistry } from "@cofounderai/module-registry";

const PROTECTED_PREFIX = "/dashboard";
const AUTH_PATHS = new Set(["/login", "/signup"]);

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

/**
 * The key of the module `pathname` belongs to, if the active business hasn't licensed
 * it -- null otherwise. CLAUDE.md's architecture section lists this route guard as one
 * of licensing's four required enforcement layers (RLS, this, requireModule(), UI
 * filtered by entitlements).
 *
 * Checked against two shapes: today's /dashboard/businesses/[id]/<prefix>/... (a module's
 * own routes living alongside discovery's /products/...) and a bare /<prefix> prefix (the
 * eventual [businessSlug]/<prefix> shape module-registry's own routePrefix docstring
 * names as the target).
 *
 * Returns the module key (not just a boolean) since 2026-09-09 -- the caller renders an
 * informative "not licensed" page naming the module and the reason, rather than a bare
 * 404 (docs/testing/test-cases/menu-smoke.md's TC-MENU-LIC-001/002, refined to spec this
 * exact page instead of the "undefined behavior" this route guard previously left it at).
 */
export function findUnlicensedModuleForRoute(pathname: string, licensedModules: Set<string>): string | null {
  for (const module of moduleRegistry) {
    const prefix = escapeForRegex(module.routePrefix);
    const businessScoped = new RegExp(`^/dashboard/businesses/[^/]+${prefix}(?:/|$)`);
    const topLevel = new RegExp(`^${prefix}(?:/|$)`);
    if ((businessScoped.test(pathname) || topLevel.test(pathname)) && !licensedModules.has(module.key)) {
      return module.key;
    }
  }
  return null;
}

/** Back-compat boolean form of `findUnlicensedModuleForRoute()` -- kept for
 * `middleware.test.ts`'s existing cases and any other caller that only needs the
 * yes/no answer, not which module. */
export function isUnlicensedModuleRoute(pathname: string, licensedModules: Set<string>): boolean {
  return findUnlicensedModuleForRoute(pathname, licensedModules) !== null;
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
  const isProtected = pathname.startsWith(PROTECTED_PREFIX);
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
      const { data: licenses } = await coreClient
        .from("licenses")
        .select("module_key, status, grace_ends_at")
        .eq("business_id", businessId);
      const licensedModules = new Set(
        (licenses ?? []).filter((l) => l.status === "active" || l.status === "grace").map((l) => l.module_key as string),
      );

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
