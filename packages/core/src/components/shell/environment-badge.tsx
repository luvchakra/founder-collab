import { ENVIRONMENT_LABEL, type OrgEnvironment } from "../../lib/org-address";

/**
 * PLATFORM-P1-10.5: one fixed colour per environment, the same for every organization --
 * Production green, Development blue, Test amber, Staging violet, Sandbox grey. The name is
 * always written next to the colour, never colour alone.
 */
export const ENVIRONMENT_COLOR: Record<OrgEnvironment, { dot: string; badge: string }> = {
  production: { dot: "bg-emerald-500", badge: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" },
  development: { dot: "bg-blue-500", badge: "border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-300" },
  test: { dot: "bg-amber-500", badge: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300" },
  staging: { dot: "bg-violet-500", badge: "border-violet-500/30 bg-violet-500/10 text-violet-700 dark:text-violet-300" },
  sandbox: { dot: "bg-zinc-400", badge: "border-zinc-400/30 bg-zinc-400/10 text-zinc-600 dark:text-zinc-300" },
};

export function EnvironmentBadge({ environment, className }: { environment: OrgEnvironment; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium ${ENVIRONMENT_COLOR[environment].badge} ${className ?? ""}`}>
      <span className={`size-1.5 rounded-full ${ENVIRONMENT_COLOR[environment].dot}`} aria-hidden="true" />
      {ENVIRONMENT_LABEL[environment]}
    </span>
  );
}
