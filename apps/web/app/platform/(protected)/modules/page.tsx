import { listModuleRegistry } from "@cofounderai/core/admin/platform-modules";
import { PlatformImpactBanner } from "../../impact-banner";
import { ModuleRegistryTable } from "./module-registry-table";

/**
 * PLATFORM-P0-07.1 ("Module Registry", docs/plan/09-PLATFORM-ADMIN-PORTAL-BACKLOG.md §11):
 * the platform-wide operational view of every licensable module -- enabled, visible,
 * licensed, minimum plan, status, and version. See `platform-modules.ts` and its
 * migration's own docstrings for what `platform.modules` is and why it's genuinely new,
 * not a duplicate of `core.modules` or `packages/module-registry`.
 *
 * Desktop table / mobile card split per CLAUDE.md development principle #12 and
 * docs/design/claude-ui-design-rules.md rule 5, mirroring `plans/page.tsx`'s own
 * established split.
 */
export default async function PlatformModulesPage() {
  const modules = await listModuleRegistry();

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">Module Administration</h1>
        <p className="text-sm text-zinc-400">
          The platform&apos;s five licensable modules and their platform-wide operational state.
        </p>
      </div>

      <PlatformImpactBanner />

      <ModuleRegistryTable modules={modules} />
    </div>
  );
}
