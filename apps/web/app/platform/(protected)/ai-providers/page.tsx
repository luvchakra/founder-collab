import { listAiProviders, type AiProviderConfig } from "@cofounderai/core/admin/platform-ai-providers";
import { Badge } from "@cofounderai/core/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@cofounderai/core/ui/table";
import { ProviderConfigDialog } from "./provider-config-dialog";
import { ProviderKeyDialog } from "./provider-key-dialog";
import { RemoveKeyDialog } from "./remove-key-dialog";

/**
 * PLATFORM-P0-09.1/09.2 ("Internal AI Provider Registry" / "Secure API Key Storage",
 * docs/plan/09-PLATFORM-ADMIN-PORTAL-BACKLOG.md §13) -- WonderArc's own platform-wide AI
 * provider configuration and key storage, genuinely distinct from a business's own BYOK
 * connection (see `platform-ai-providers.ts` and its migration's own docstrings for the
 * full reasoning). Always exactly three rows (OpenAI/Anthropic/Google Gemini,
 * model-registry.ts's own fixed provider set) -- there is no add/remove-provider affordance
 * anywhere on this page, matching the registry's own fixed-catalog shape.
 *
 * Desktop table / mobile card split per CLAUDE.md development principle #12 and
 * docs/design/claude-ui-design-rules.md rule 5, mirroring `feature-flags/page.tsx`'s own
 * established split.
 */
export default async function PlatformAiProvidersPage() {
  const providers = await listAiProviders();

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">AI Providers</h1>
        <p className="text-sm text-zinc-400">
          WonderArc&apos;s own platform-wide AI provider configuration and key storage -- separate from any
          business&apos;s own connected key. Every change is recorded with a reason.
        </p>
      </div>

      <div className="rounded-2xl border border-zinc-800">
        <ul className="divide-y divide-zinc-800 md:hidden">
          {providers.map((provider) => (
            <ProviderCard key={provider.provider} provider={provider} />
          ))}
        </ul>

        <Table className="hidden md:table">
          <TableHeader>
            <TableRow className="border-zinc-800 hover:bg-transparent">
              <TableHead className="text-zinc-400">Provider</TableHead>
              <TableHead className="text-zinc-400">Status</TableHead>
              <TableHead className="text-zinc-400">Models</TableHead>
              <TableHead className="text-zinc-400">Key</TableHead>
              <TableHead className="text-right text-zinc-400">
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {providers.map((provider) => (
              <TableRow key={provider.provider} className="border-zinc-800 hover:bg-zinc-900/60">
                <TableCell className="text-zinc-100">
                  <p className="font-medium">{provider.label}</p>
                </TableCell>
                <TableCell>
                  <Badge variant={provider.enabled ? "default" : "secondary"}>
                    {provider.enabled ? "Enabled" : "Disabled"}
                  </Badge>
                </TableCell>
                <TableCell className="text-zinc-300">
                  <ModelsSummary provider={provider} />
                </TableCell>
                <TableCell className="text-zinc-300">
                  <KeyStatus provider={provider} />
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-1">
                    <ProviderConfigDialog provider={provider} />
                    <ProviderKeyDialog provider={provider} />
                    {provider.configured ? <RemoveKeyDialog provider={provider.provider} label={provider.label} /> : null}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function ModelsSummary({ provider }: { provider: AiProviderConfig }) {
  if (provider.models.length === 0) return <span className="text-zinc-500">No models configured</span>;
  return (
    <div className="flex flex-col gap-0.5 text-xs">
      <span>{provider.models.join(", ")}</span>
      {provider.defaultModel ? <span className="text-zinc-500">Default: {provider.defaultModel}</span> : null}
      {provider.fallbackModel ? <span className="text-zinc-500">Fallback: {provider.fallbackModel}</span> : null}
    </div>
  );
}

function KeyStatus({ provider }: { provider: AiProviderConfig }) {
  if (!provider.configured) return <Badge variant="secondary">Not configured</Badge>;
  return (
    <div className="flex flex-col gap-0.5">
      <Badge>Configured</Badge>
      <span className="text-xs text-zinc-500">{"•".repeat(12)}{provider.keyFingerprint}</span>
    </div>
  );
}

function ProviderCard({ provider }: { provider: AiProviderConfig }) {
  return (
    <li className="flex flex-col gap-2 p-3 text-sm text-zinc-100">
      <div className="flex items-start justify-between gap-2">
        <p className="font-medium">{provider.label}</p>
        <Badge variant={provider.enabled ? "default" : "secondary"}>{provider.enabled ? "Enabled" : "Disabled"}</Badge>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-400">
        <ModelsSummary provider={provider} />
      </div>
      <div className="flex items-center gap-2">
        <KeyStatus provider={provider} />
      </div>
      <div className="flex flex-wrap items-center gap-1">
        <ProviderConfigDialog provider={provider} />
        <ProviderKeyDialog provider={provider} />
        {provider.configured ? <RemoveKeyDialog provider={provider.provider} label={provider.label} /> : null}
      </div>
    </li>
  );
}
