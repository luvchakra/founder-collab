import type { ReactNode } from "react";
import { getAiFeaturePolicy, listAiFeaturePolicyProviderOptions } from "@cofounderai/core/admin/platform-ai-feature-policies";
import { Badge } from "@cofounderai/core/ui/badge";
import { FeaturePolicyDialog } from "./feature-policy-dialog";

/**
 * PLATFORM-P0-09.4 ("AI Feature Policies", docs/plan/09-PLATFORM-ADMIN-PORTAL-BACKLOG.md
 * §13) -- CONFIG-ONLY, same scope as PLATFORM-P0-09.3. See `platform-ai-feature-policies.ts`
 * and its migration's own docstrings for the full reasoning: this page shows and edits a
 * platform-wide *ceiling* on AI usage/spend -- nothing here is enforced by any real AI call
 * yet (PLATFORM-P0-10.1/10.2, §14, is the later, separate story that wires real
 * enforcement).
 *
 * A single settings surface, not a list of rows -- there is exactly one feature-policy
 * row (singleton `platform.ai_feature_policies`), so there is no table/mobile-card split
 * to make (CLAUDE.md development principle #12 targets a page whose *primary* content is a
 * table of many rows).
 */
export default async function PlatformAiFeaturePoliciesPage() {
  const [policy, providerOptions] = await Promise.all([getAiFeaturePolicy(), listAiFeaturePolicyProviderOptions()]);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">AI Feature Policies</h1>
        <p className="text-sm text-zinc-400">
          Platform-wide ceilings on AI usage and spend -- configuration only, nothing here is enforced by any real
          AI call yet. Every change is recorded with a reason.
        </p>
      </div>

      <div className="flex flex-col gap-4 rounded-2xl border border-zinc-800 p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex flex-col gap-3 text-sm">
            <Field label="AI features">
              <Badge variant={policy.aiEnabled ? "default" : "secondary"}>{policy.aiEnabled ? "Enabled" : "Disabled"}</Badge>
            </Field>
            <Field label="Allowed providers">
              {policy.allowedProviders.length === 0 ? (
                <span className="text-zinc-500">No restriction configured</span>
              ) : (
                <div className="flex flex-wrap gap-1">
                  {policy.allowedProviders.map((p) => (
                    <Badge key={p} variant="secondary">
                      {providerOptions.find((o) => o.provider === p)?.label ?? p}
                    </Badge>
                  ))}
                </div>
              )}
            </Field>
            <Field label="Allowed models">
              <span className={policy.allowedModels.length === 0 ? "text-zinc-500" : "text-zinc-100"}>
                {policy.allowedModels.length === 0 ? "No restriction configured" : policy.allowedModels.join(", ")}
              </span>
            </Field>
            <Field label="Maximum tokens per run">
              <span className={policy.maxTokensPerRun === null ? "text-zinc-500" : "text-zinc-100"}>
                {policy.maxTokensPerRun === null ? "No ceiling configured" : policy.maxTokensPerRun.toLocaleString()}
              </span>
            </Field>
            <Field label="Maximum run cost">
              <span className={policy.maxRunCostUsd === null ? "text-zinc-500" : "text-zinc-100"}>
                {policy.maxRunCostUsd === null ? "No ceiling configured" : `$${policy.maxRunCostUsd.toFixed(4)}`}
              </span>
            </Field>
            <Field label="Daily platform budget">
              <span className={policy.dailyPlatformBudgetUsd === null ? "text-zinc-500" : "text-zinc-100"}>
                {policy.dailyPlatformBudgetUsd === null ? "No budget configured" : `$${policy.dailyPlatformBudgetUsd.toFixed(2)}`}
              </span>
            </Field>
          </div>
          <FeaturePolicyDialog policy={policy} providerOptions={providerOptions} />
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs uppercase tracking-wide text-zinc-500">{label}</span>
      <div>{children}</div>
    </div>
  );
}
