// EXP-ADMIN-02 -- AI usage export.
import { listAiUsage, type AiUsageRun } from "@cofounderai/core/admin/platform-ai-usage";
import type { PlatformExportAdapter } from "@cofounderai/core/exports/platform";

const PAGE_SIZE = 100;
/** listAiUsage takes a per-source limit (two ledgers, merged); PostgREST caps each
 * source's response at 1,000 rows, so this is the most "all" can honestly mean without a
 * new paged query -- and the file says so when the cap is reached. */
export const AI_USAGE_EXPORT_MAX = 1000;

type Summary = { provider: string; model: string; operation: string; requests: number; inputTokens: number | null; outputTokens: number | null; cost: number | null; failed: number };

const sumOrNull = (values: (number | null)[]) =>
  values.every((v) => v == null) ? null : values.reduce<number>((total, v) => total + (v ?? 0), 0);

/**
 * One row per AI run (provider, model, operation, business, tokens, estimated cost,
 * status, time) plus a Summary sheet grouped by provider, model and operation. Never the
 * prompt or response text -- those carry tenant data, and listAiUsage doesn't read them.
 */
export const platformAiUsageExport: PlatformExportAdapter<Record<string, never>> = {
  id: "platform.ai-usage",
  parseFilters: () => ({}),
  async load(context) {
    const limit = context.scope === "all" ? AI_USAGE_EXPORT_MAX : PAGE_SIZE;
    const runs = await listAiUsage(limit);
    const groups = new Map<string, AiUsageRun[]>();
    for (const run of runs) {
      const key = [run.provider ?? "", run.model, run.operation].join("|");
      groups.set(key, [...(groups.get(key) ?? []), run]);
    }
    const summary: Summary[] = [...groups.values()].map((group) => ({
      provider: group[0]!.provider ?? "",
      model: group[0]!.model,
      operation: group[0]!.operation,
      requests: group.length,
      inputTokens: sumOrNull(group.map((r) => r.inputTokens)),
      outputTokens: sumOrNull(group.map((r) => r.outputTokens)),
      cost: sumOrNull(group.map((r) => r.estimatedCost)),
      failed: group.filter((r) => r.status === "failed").length,
    }));
    const times = runs.map((r) => r.createdAt).sort();
    return {
      module: "platform",
      resource: "ai-usage",
      title: "AI usage",
      metadata: {
        Period: times.length > 0 ? `${times[0]!.slice(0, 10)} to ${times[times.length - 1]!.slice(0, 10)}` : "No runs",
        ...(runs.length >= limit ? { Note: `Limited to the newest ${limit.toLocaleString("en-IN")} runs per usage ledger.` } : {}),
      },
      sheets: [
        {
          sheetName: "Runs",
          columns: [
            { key: "createdAt", header: "Time", type: "datetime", getValue: (r: AiUsageRun) => r.createdAt },
            { key: "business", header: "Business", getValue: (r: AiUsageRun) => r.businessName },
            { key: "module", header: "Module", getValue: (r: AiUsageRun) => r.module },
            { key: "operation", header: "Operation", getValue: (r: AiUsageRun) => r.operation },
            { key: "provider", header: "Provider", getValue: (r: AiUsageRun) => r.provider },
            { key: "model", header: "Model", getValue: (r: AiUsageRun) => r.model },
            { key: "inputTokens", header: "Input tokens", type: "integer", getValue: (r: AiUsageRun) => r.inputTokens },
            { key: "outputTokens", header: "Output tokens", type: "integer", getValue: (r: AiUsageRun) => r.outputTokens },
            { key: "cost", header: "Estimated cost (USD)", type: "currency", currency: "USD", getValue: (r: AiUsageRun) => r.estimatedCost },
            { key: "status", header: "Status", getValue: (r: AiUsageRun) => (r.status === "failed" ? "Failed" : "Succeeded") },
          ],
          rows: runs,
        },
        {
          sheetName: "Summary",
          columns: [
            { key: "provider", header: "Provider", getValue: (s: Summary) => s.provider },
            { key: "model", header: "Model", getValue: (s: Summary) => s.model },
            { key: "operation", header: "Operation", getValue: (s: Summary) => s.operation },
            { key: "requests", header: "Requests", type: "integer", getValue: (s: Summary) => s.requests },
            { key: "failed", header: "Failed", type: "integer", getValue: (s: Summary) => s.failed },
            { key: "inputTokens", header: "Input tokens", type: "integer", getValue: (s: Summary) => s.inputTokens },
            { key: "outputTokens", header: "Output tokens", type: "integer", getValue: (s: Summary) => s.outputTokens },
            { key: "cost", header: "Estimated cost (USD)", type: "currency", currency: "USD", getValue: (s: Summary) => s.cost },
          ],
          rows: summary,
        },
      ],
    };
  },
};
