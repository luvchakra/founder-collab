export interface ShellNavItem {
  label: string;
  /** Route segment under the module's own `routePrefix`; "" means the module's root
   * route itself. */
  slug: string;
  /** lucide-react icon name, resolved via ./module-icon. */
  icon: string;
}

export interface ShellNavGroup {
  /** Omitted for a flat list with no section heading. */
  heading?: string;
  items: ShellNavItem[];
}

/**
 * Minimal, duck-typed shape the shell needs from a module manifest — deliberately not
 * importing @cofounderai/module-registry's own type here, so packages/core stays
 * decoupled from that package (the caller, e.g. apps/web, maps its real
 * ModuleManifest[] into this shape; module-registry's own `ModuleNavGroup`/
 * `ModuleNavItem` are structurally identical to `ShellNavGroup`/`ShellNavItem` below, so
 * passing `moduleRegistry` straight through needs no per-field mapping).
 */
export interface ShellNavModule {
  key: string;
  name: string;
  /** lucide-react icon name, resolved via ./module-icon. */
  icon: string;
  routePrefix: string;
  /** This module's own sidebar nav tree, rendered generically by AppSidebar for every
   * module except discovery (whose real content is a live per-business product list,
   * not a static tree — see app-sidebar.tsx's own discovery special case). */
  nav: ShellNavGroup[];
  /** Active-or-grace for the effective business (listLicensedModuleKeysByBusiness).
   * Every module is listed in the picker regardless — an unlicensed one just routes to
   * the business's not-licensed page instead of switching the drawer to it, so a
   * founder can see what's available and how to unlock it rather than the module
   * quietly not existing at all. */
  licensed: boolean;
}

export interface ShellUser {
  name: string;
  email: string;
  avatarUrl?: string;
  /** Gates the account menu's "Admin" link -- a cross-tenant, environment-controlled
   * gate (PLATFORM_ADMIN_EMAILS), unrelated to any business's own membership/role. Not
   * itself a security boundary: the /dashboard/admin page and its server actions each
   * re-check requirePlatformAdmin() regardless of what this renders. */
  isPlatformAdmin?: boolean;
}

export interface ShellBusiness {
  id: string;
  name: string;
  description?: string | null;
}

/** A discovery product/workspace belonging to a business -- shown under the sidebar's
 * Discovery section for whichever business is currently active. */
export interface ShellProduct {
  id: string;
  name: string;
}

/** A derived, non-persisted notification for the topbar's alert bell — see
 * @cofounderai/module-discovery's lib/alerts/derive.ts for how discovery computes these;
 * the shell itself has no opinion on where an alert comes from. */
export interface ShellAlert {
  id: string;
  severity: "warning" | "info";
  message: string;
  href: string;
}
