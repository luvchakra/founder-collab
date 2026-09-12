import { listAiUsage, type AiUsageRun } from "@cofounderai/core/admin/platform-ai-usage";
import { Badge } from "@cofounderai/core/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@cofounderai/core/ui/table";

/**
 * PLATFORM-P0-09.5 ("AI Usage", docs/plan/09-PLATFORM-ADMIN-PORTAL-BACKLOG.md §13) -- a
 * read-only, platform-wide view of the most recent AI runs, merged from `core.ai_runs`
 * (module-crm's own usage today) and `discovery.ai_runs` (discovery's own usage). See
 * `platform-ai-usage.ts` for the full reasoning behind every derived field ("module" is a
 * best-effort label, not a stored column) and why no secret credential is read anywhere in
 * this path (§13's own explicit instruction for this story).
 *
 * Desktop table / mobile card split per CLAUDE.md development principle #12 and
 * docs/design/claude-ui-design-rules.md rule 5 -- unlike `/platform/ai-routing` and
 * `/platform/ai-feature-policies` (a single settings row each), this page's primary
 * content genuinely is a table of many rows, so the split applies here.
 */
export default async function PlatformAiUsagePage() {
  const runs = await listAiUsage(100);

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">AI Usage</h1>
        <p className="text-sm text-zinc-400">
          The most recent {runs.length} AI runs across the platform, newest first. Read-only -- no secret
          credential is ever shown here.
        </p>
      </div>

      <div className="rounded-2xl border border-zinc-800">
        {runs.length === 0 ? (
          <p className="p-4 text-sm text-zinc-500">No AI runs recorded yet.</p>
        ) : (
          <>
            <ul className="divide-y divide-zinc-800 md:hidden">
              {runs.map((run) => (
                <RunCard key={`${run.source}:${run.id}`} run={run} />
              ))}
            </ul>

            <Table className="hidden md:table">
              <TableHeader>
                <TableRow className="border-zinc-800 hover:bg-transparent">
                  <TableHead className="text-zinc-400">When</TableHead>
                  <TableHead className="text-zinc-400">Module</TableHead>
                  <TableHead className="text-zinc-400">Business</TableHead>
                  <TableHead className="text-zinc-400">Provider / Model</TableHead>
                  <TableHead className="text-zinc-400">Tokens</TableHead>
                  <TableHead className="text-zinc-400">Est. cost</TableHead>
                  <TableHead className="text-zinc-400">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {runs.map((run) => (
                  <TableRow key={`${run.source}:${run.id}`} className="border-zinc-800 hover:bg-zinc-900/60">
                    <TableCell className="text-zinc-400">{formatWhen(run.createdAt)}</TableCell>
                    <TableCell className="text-zinc-100">
                      <ModuleLabel run={run} />
                    </TableCell>
                    <TableCell className="text-zinc-300">{run.businessName ?? <span className="text-zinc-500">Unknown</span>}</TableCell>
                    <TableCell className="text-zinc-300">
                      <ProviderModel run={run} />
                    </TableCell>
                    <TableCell className="text-zinc-300">{formatTokens(run)}</TableCell>
                    <TableCell className="text-zinc-300">{formatCost(run.estimatedCost)}</TableCell>
                    <TableCell>
                      <StatusBadge status={run.status} />
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

function formatWhen(createdAt: string): string {
  return new Date(createdAt).toLocaleString();
}

function formatTokens(run: AiUsageRun): string {
  if (run.inputTokens === null && run.outputTokens === null) return "—";
  return `${(run.inputTokens ?? 0).toLocaleString()} in / ${(run.outputTokens ?? 0).toLocaleString()} out`;
}

function formatCost(estimatedCost: number | null): string {
  return estimatedCost === null ? "—" : `$${estimatedCost.toFixed(4)}`;
}

function ModuleLabel({ run }: { run: AiUsageRun }) {
  if (run.module === null) {
    return (
      <span className="text-zinc-500" title={`Operation "${run.operation}" isn't in the known module map`}>
        Unknown ({run.operation})
      </span>
    );
  }
  return <span className="capitalize">{run.module}</span>;
}

function ProviderModel({ run }: { run: AiUsageRun }) {
  return (
    <div className="flex flex-col gap-0.5 text-xs">
      <span className="text-zinc-100">{run.provider ?? "—"}</span>
      <span className="text-zinc-500">{run.model}</span>
    </div>
  );
}

function StatusBadge({ status }: { status: AiUsageRun["status"] }) {
  return <Badge variant={status === "succeeded" ? "default" : "destructive"}>{status}</Badge>;
}

function RunCard({ run }: { run: AiUsageRun }) {
  return (
    <li className="flex flex-col gap-2 p-3 text-sm text-zinc-100">
      <div className="flex items-start justify-between gap-2">
        <ModuleLabel run={run} />
        <StatusBadge status={run.status} />
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-400">
        <span>{run.businessName ?? "Unknown business"}</span>
        <span>{formatWhen(run.createdAt)}</span>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-400">
        <ProviderModel run={run} />
        <span>{formatTokens(run)}</span>
        <span>{formatCost(run.estimatedCost)}</span>
      </div>
    </li>
  );
}
