import {
  isFeatureFlagActive,
  listFeatureFlagScopeOptions,
  listFeatureFlags,
  type FeatureFlag,
} from "@cofounderai/core/admin/platform-feature-flags";
import { Badge } from "@cofounderai/core/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@cofounderai/core/ui/table";
import { PlatformImpactBanner } from "../../impact-banner";
import { DeleteFlagDialog } from "./delete-flag-dialog";
import { FeatureFlagDialog } from "./feature-flag-dialog";

/**
 * PLATFORM-P0-08.1/08.2/08.3/08.4 ("Feature Flags", docs/plan/09-PLATFORM-ADMIN-PORTAL-
 * BACKLOG.md §12) -- the platform-wide operational feature-flag catalog: create/edit/
 * delete flags with a Global/Plan/Module/Country scope and an optional effective window,
 * every change audited. See `platform-feature-flags.ts` and its migration's own docstrings
 * for why this is genuinely distinct from PLATFORM-P0-04.4's commercial
 * `platform.features`/`platform.plan_features`, and for why no real kill-switch wiring
 * into any specific subsystem (AI research, WhatsApp, government submission, etc.) is
 * built this story -- this run's own workstream boundary forbids touching those modules'
 * files regardless, and no such wiring story exists in this backlog yet.
 *
 * Desktop table / mobile card split per CLAUDE.md development principle #12 and
 * docs/design/claude-ui-design-rules.md rule 5, mirroring `plans/page.tsx`'s own
 * established split.
 */
export default async function PlatformFeatureFlagsPage() {
  const [flags, scopeOptions] = await Promise.all([listFeatureFlags(), listFeatureFlagScopeOptions()]);

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Feature Flags</h1>
          <p className="text-sm text-zinc-400">
            Operational on/off controls for reliability, staged rollout, and emergency kill switches -- distinct
            from a plan&apos;s own commercial entitlements.
          </p>
        </div>
        <FeatureFlagDialog scopeOptions={scopeOptions} />
      </div>

      <PlatformImpactBanner />

      <div className="rounded-2xl border border-zinc-800">
        {flags.length === 0 ? (
          <p className="px-4 py-6 text-sm text-zinc-500">No feature flags defined yet.</p>
        ) : (
          <>
            <ul className="divide-y divide-zinc-800 md:hidden">
              {flags.map((flag) => (
                <li key={flag.id} className="flex flex-col gap-2 p-3 text-sm text-zinc-100">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-medium">{flag.featureKey}</p>
                      {flag.description ? <p className="text-xs text-zinc-500">{flag.description}</p> : null}
                    </div>
                    <StatusBadge flag={flag} />
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-400">
                    <span>Scope: {scopeLabel(flag)}</span>
                    {(flag.effectiveFrom || flag.effectiveTo) && <span>Window: {windowLabel(flag)}</span>}
                  </div>
                  <div className="flex items-center gap-1">
                    <FeatureFlagDialog flag={flag} scopeOptions={scopeOptions} />
                    <DeleteFlagDialog id={flag.id} featureKey={flag.featureKey} />
                  </div>
                </li>
              ))}
            </ul>

            <Table className="hidden md:table">
              <TableHeader>
                <TableRow className="border-zinc-800 hover:bg-transparent">
                  <TableHead className="text-zinc-400">Flag</TableHead>
                  <TableHead className="text-zinc-400">Scope</TableHead>
                  <TableHead className="text-zinc-400">Status</TableHead>
                  <TableHead className="text-zinc-400">Effective window</TableHead>
                  <TableHead className="text-right text-zinc-400">
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {flags.map((flag) => (
                  <TableRow key={flag.id} className="border-zinc-800 hover:bg-zinc-900/60">
                    <TableCell className="text-zinc-100">
                      <p className="font-medium">{flag.featureKey}</p>
                      {flag.description ? <p className="text-xs text-zinc-500">{flag.description}</p> : null}
                    </TableCell>
                    <TableCell className="text-zinc-300">{scopeLabel(flag)}</TableCell>
                    <TableCell>
                      <StatusBadge flag={flag} />
                    </TableCell>
                    <TableCell className="text-zinc-300">{windowLabel(flag) ?? "Always"}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <FeatureFlagDialog flag={flag} scopeOptions={scopeOptions} />
                        <DeleteFlagDialog id={flag.id} featureKey={flag.featureKey} />
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </>
        )}
      </div>
    </div>
  );
}

function scopeLabel(flag: FeatureFlag): string {
  if (flag.scopeType === "plan") return `Plan -- ${flag.scopePlan?.name ?? "?"}`;
  if (flag.scopeType === "module") return `Module -- ${flag.scopeModule?.name ?? "?"}`;
  if (flag.scopeType === "country") return `Country -- ${flag.scopeCountryCode ?? "?"}`;
  return "Global";
}

function windowLabel(flag: FeatureFlag): string | null {
  if (!flag.effectiveFrom && !flag.effectiveTo) return null;
  const from = flag.effectiveFrom ? new Date(flag.effectiveFrom).toLocaleString() : "now";
  const to = flag.effectiveTo ? new Date(flag.effectiveTo).toLocaleString() : "indefinitely";
  return `${from} -> ${to}`;
}

function StatusBadge({ flag }: { flag: FeatureFlag }) {
  if (!flag.enabled) return <Badge variant="destructive">Disabled</Badge>;
  if (isFeatureFlagActive(flag)) return <Badge>Active</Badge>;
  const now = new Date();
  if (flag.effectiveFrom && now < new Date(flag.effectiveFrom)) return <Badge variant="secondary">Scheduled</Badge>;
  return <Badge variant="secondary">Expired</Badge>;
}
