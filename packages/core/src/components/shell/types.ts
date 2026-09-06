/**
 * Minimal, duck-typed shape the shell needs from a module manifest — deliberately not
 * importing @cofounderai/module-registry's own type here, so packages/core stays
 * decoupled from that package (the caller, e.g. apps/web, maps its real
 * ModuleManifest[] into this shape).
 */
export interface ShellNavModule {
  key: string;
  name: string;
  /** lucide-react icon name, resolved via ./module-icon. */
  icon: string;
  routePrefix: string;
}

export interface ShellUser {
  name: string;
  email: string;
  avatarUrl?: string;
}

export interface ShellBusiness {
  id: string;
  name: string;
  description?: string | null;
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
