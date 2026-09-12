import { getAiProviderRouting, listAiProviderRoutingOptions } from "@cofounderai/core/admin/platform-ai-provider-routing";
import { Badge } from "@cofounderai/core/ui/badge";
import { RoutingConfigDialog } from "./routing-config-dialog";

/**
 * PLATFORM-P0-09.3 ("Provider Routing", docs/plan/09-PLATFORM-ADMIN-PORTAL-BACKLOG.md §13)
 * -- CONFIG-ONLY. See `platform-ai-provider-routing.ts` and its migration's own docstrings
 * for the full reasoning. This page shows and edits WonderArc's platform-wide AI routing
 * *policy* -- it does not show live traffic, and nothing here reflects an actual AI call's
 * real provider choice yet (that wiring is a separate, future story).
 *
 * A single settings surface, not a list of rows -- there is exactly one routing policy
 * (singleton `platform.ai_provider_routing` row), so this page has no table/mobile-card
 * split to make (CLAUDE.md development principle #12 applies to a page whose *primary*
 * content is a table of many rows; the up-to-five module overrides here are shown as
 * stacked labeled rows either way, already narrow-screen-safe without a table at all).
 */
export default async function PlatformAiRoutingPage() {
  const [routing, options] = await Promise.all([getAiProviderRouting(), listAiProviderRoutingOptions()]);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">AI Provider Routing</h1>
        <p className="text-sm text-zinc-400">
          WonderArc&apos;s platform-wide routing policy -- which provider each module should prefer, and what to
          fall back to. Configuration only: no AI call is actually routed by this yet. Every change is recorded
          with a reason.
        </p>
      </div>

      <div className="flex flex-col gap-4 rounded-2xl border border-zinc-800 p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex flex-col gap-3 text-sm">
            <Field label="Default provider" value={routing.defaultProvider ? labelFor(routing.defaultProvider, options) : null} />
            <Field label="Default model" value={routing.defaultModel} />
            <Field label="Fallback provider" value={routing.fallbackProvider ? labelFor(routing.fallbackProvider, options) : null} />
          </div>
          <RoutingConfigDialog routing={routing} options={options} />
        </div>

        <div className="border-t border-zinc-800 pt-3">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500">Module overrides</p>
          {routing.moduleOverrides.length === 0 ? (
            <p className="text-sm text-zinc-500">No module-specific overrides -- every module uses the default provider.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {routing.moduleOverrides.map((override) => (
                <li
                  key={override.moduleKey}
                  className="flex items-center justify-between gap-2 rounded-lg border border-zinc-800 px-3 py-2 text-sm"
                >
                  <span className="text-zinc-100">{override.moduleName}</span>
                  <Badge variant="secondary">{labelFor(override.provider, options)}</Badge>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function labelFor(provider: string, options: Awaited<ReturnType<typeof listAiProviderRoutingOptions>>): string {
  return options.providers.find((p) => p.provider === provider)?.label ?? provider;
}

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs uppercase tracking-wide text-zinc-500">{label}</span>
      <span className="text-zinc-100">{value ?? <span className="text-zinc-500">Not set</span>}</span>
    </div>
  );
}
