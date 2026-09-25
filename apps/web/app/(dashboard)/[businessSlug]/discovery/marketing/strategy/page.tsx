import { PageHeader } from "@cofounderai/core/ui/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@cofounderai/core/ui/card";
import { Input } from "@cofounderai/core/ui/input";
import { NativeSelect } from "@cofounderai/core/ui/native-select";
import { StatusBadge } from "@cofounderai/core/ui/status-badge";
import { listOfferingOptions, listStrategies, pickCurrentStrategy } from "@cofounderai/module-discovery/lib/marketing/queries";
import { MARKETING_CHANNEL_LABEL, type MarketingStrategy, type StrategyGoal } from "@cofounderai/module-discovery/lib/marketing/types";
import { ActionForm } from "@cofounderai/module-discovery/components/marketing/action-form";
import { StrategyFields } from "@cofounderai/module-discovery/components/marketing/strategy-fields";
import { activateStrategyAction, saveStrategyAction, saveStrategyGoalsAction } from "../actions";
import { marketingContext } from "../context";

const GOAL_STATUS: { value: StrategyGoal["status"]; label: string }[] = [
  { value: "not_started", label: "Not started" },
  { value: "on_track", label: "On track" },
  { value: "at_risk", label: "At risk" },
  { value: "achieved", label: "Achieved" },
  { value: "missed", label: "Missed" },
];

/**
 * MKT-04 — Marketing strategy (§8). One explicit, editable strategy per scope, versioned:
 * saving writes a new draft, and a draft replaces the active strategy only when someone
 * activates it. Goals are the business's own — nothing is hard-coded (§8.1).
 */
export default async function StrategyPage({
  params,
  searchParams,
}: {
  params: Promise<{ businessSlug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ businessSlug }, sp] = await Promise.all([params, searchParams]);
  const { businessId, canManage } = await marketingContext(businessSlug);
  const [strategies, offerings] = await Promise.all([listStrategies(businessId), listOfferingOptions(businessId)]);
  const selected =
    (typeof sp.version === "string" ? strategies.find((s) => s.id === sp.version) : undefined) ?? pickCurrentStrategy(strategies);
  const offeringName = (id: string | null) => (id ? (offerings.find((o) => o.id === id)?.name ?? "Offering") : "Whole company");

  return (
    <>
      <PageHeader
        title="Strategy"
        description="Positioning, value proposition, target markets, messaging and goals. Every save is kept as a version."
      />

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <div className="flex flex-col gap-6">
          {selected ? <StrategySummary strategy={selected} scope={offeringName(selected.offeringId)} /> : null}

          {canManage ? (
            <Card>
              <CardHeader>
                <CardTitle>{selected ? "Edit as a new draft" : "Write the strategy"}</CardTitle>
                <CardDescription>
                  {selected
                    ? `Starts from v${selected.versionNumber}. The active strategy does not change until you activate the new draft.`
                    : "Saved as a draft. Activate it when it is ready."}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ActionForm
                  action={saveStrategyAction.bind(null, businessId, selected?.id ?? null)}
                  submitLabel="Save draft"
                  pendingText="Saving..."
                >
                  <StrategyFields strategy={selected} offerings={offerings} />
                </ActionForm>
              </CardContent>
            </Card>
          ) : null}
        </div>

        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Versions</CardTitle>
            </CardHeader>
            <CardContent>
              {strategies.length === 0 ? (
                <p className="text-sm text-muted-foreground">No strategy yet.</p>
              ) : (
                <ul className="flex flex-col gap-3">
                  {strategies.map((s) => (
                    <li key={s.id} className="flex flex-col gap-1 text-sm">
                      <div className="flex items-center justify-between gap-2">
                        <a href={`?version=${s.id}`} className={`truncate hover:underline ${s.id === selected?.id ? "font-medium" : ""}`}>
                          v{s.versionNumber} · {s.name}
                        </a>
                        <StatusBadge status={s.status} tone={s.status === "active" ? "success" : "secondary"} />
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {offeringName(s.offeringId)} · {s.origin === "ai_draft" ? "AI draft" : "Written by a person"} · {s.updatedAt.slice(0, 10)}
                      </p>
                      {canManage && s.status === "draft" ? (
                        <ActionForm action={activateStrategyAction.bind(null, businessId, s.id)} inline submitLabel="Activate" variant="secondary" />
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          {selected ? (
            <Card>
              <CardHeader>
                <CardTitle>Goals</CardTitle>
                <CardDescription>Targets you set. Progress is whatever you mark it as.</CardDescription>
              </CardHeader>
              <CardContent>
                {canManage ? (
                  <ActionForm action={saveStrategyGoalsAction.bind(null, businessId, selected.id)} submitLabel="Save goals">
                    {[...selected.goals, null].map((g, i) => (
                      <fieldset key={i} className="grid grid-cols-2 gap-2 rounded-md border p-2">
                        <legend className="sr-only">Goal {i + 1}</legend>
                        <Input name="goal_name" placeholder="Goal" defaultValue={g?.name ?? ""} aria-label="Goal name" className="col-span-2" />
                        <Input name="goal_metric" placeholder="Metric (e.g. qualified leads)" defaultValue={g?.metric ?? ""} aria-label="Metric" />
                        <Input name="goal_target" placeholder="Target" inputMode="decimal" defaultValue={g?.target ?? ""} aria-label="Target" />
                        <Input name="goal_period" placeholder="Period (e.g. Q4 FY26)" defaultValue={g?.period ?? ""} aria-label="Period" />
                        <NativeSelect name="goal_status" defaultValue={g?.status ?? "not_started"} aria-label="Status">
                          {GOAL_STATUS.map((o) => (
                            <option key={o.value} value={o.value}>
                              {o.label}
                            </option>
                          ))}
                        </NativeSelect>
                      </fieldset>
                    ))}
                  </ActionForm>
                ) : selected.goals.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No goals set.</p>
                ) : (
                  <ul className="flex flex-col gap-2 text-sm">
                    {selected.goals.map((g, i) => (
                      <li key={i}>
                        {g.name}: {g.target ?? "—"} {g.metric} ({g.period}) · {GOAL_STATUS.find((s) => s.value === g.status)?.label}
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>
    </>
  );
}

function StrategySummary({ strategy: s, scope }: { strategy: MarketingStrategy; scope: string }) {
  const rows: [string, string | string[] | undefined][] = [
    ["Positioning", s.positioning.statement],
    ["Category", s.positioning.category],
    ["Problem", s.positioning.targetProblem],
    ["Headline", s.valueProposition.headline],
    ["Supporting points", s.valueProposition.supportingPoints],
    ["Proof points", s.valueProposition.proofPoints],
    ["Differentiators", s.differentiation.differentiators],
    ["Why us", s.differentiation.whyUs],
    ["Regions", s.targetMarkets.regions],
    ["Industries", s.targetMarkets.industries],
    ["Buyer segments", s.targetMarkets.buyerSegments],
    ["Key messages", s.messaging.keyMessages],
    ["Channels", s.channels.map((c) => MARKETING_CHANNEL_LABEL[c])],
  ];
  const filled = rows.filter(([, v]) => (Array.isArray(v) ? v.length > 0 : Boolean(v)));
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          {s.name} <StatusBadge status={s.status} tone={s.status === "active" ? "success" : "secondary"} />
        </CardTitle>
        <CardDescription>
          v{s.versionNumber} · {scope}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {filled.length === 0 ? (
          <p className="text-sm text-muted-foreground">This version is empty.</p>
        ) : (
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            {filled.map(([label, value]) => (
              <div key={label}>
                <dt className="text-xs text-muted-foreground">{label}</dt>
                <dd className="mt-0.5">
                  {Array.isArray(value) ? (
                    <ul className="list-disc pl-4">
                      {value.map((v) => (
                        <li key={v}>{v}</li>
                      ))}
                    </ul>
                  ) : (
                    value
                  )}
                </dd>
              </div>
            ))}
          </dl>
        )}
      </CardContent>
    </Card>
  );
}
