import { ClipboardCheck } from "lucide-react";
import { PageHeader } from "@cofounderai/core/ui/page-header";
import { ExportMenu } from "@cofounderai/core/export-ui/export-menu";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@cofounderai/core/ui/card";
import { Input } from "@cofounderai/core/ui/input";
import { Textarea } from "@cofounderai/core/ui/textarea";
import { NativeSelect } from "@cofounderai/core/ui/native-select";
import { EmptyState } from "@cofounderai/core/ui/empty-state";
import { listReadinessItems } from "@cofounderai/module-discovery/lib/funding/queries";
import { readinessSummary } from "@cofounderai/module-discovery/lib/funding/metrics";
import {
  READINESS_CATEGORIES,
  READINESS_CATEGORY_LABEL,
  READINESS_STATUSES,
  READINESS_STATUS_LABEL,
  type ReadinessItem,
} from "@cofounderai/module-discovery/lib/funding/types";
import { ActionForm } from "@cofounderai/module-discovery/components/marketing/action-form";
import { Field } from "@cofounderai/module-discovery/components/marketing/field";
import { TransitionButtons } from "@cofounderai/module-discovery/components/marketing/transition-buttons";
import { ReadinessBadge } from "@cofounderai/module-discovery/components/funding/status";
import {
  addStandardReadinessAction,
  createReadinessAction,
  deleteReadinessAction,
  setReadinessStatusAction,
  updateReadinessAction,
} from "../actions";
import { fundingContext } from "../context";

/**
 * FND-05 — Investor readiness (§22). A checklist by category, with completion counted
 * only over items that apply. Nothing marks an item Ready except a person pressing
 * "Mark ready" (§22.4) — the platform never declares the company fundraising-ready.
 */
export default async function ReadinessPage({ params }: { params: Promise<{ businessSlug: string }> }) {
  const { businessSlug } = await params;
  const { businessId, canView, canManage } = await fundingContext(businessSlug);
  if (!canView) return null;
  const items = await listReadinessItems(businessId);
  const today = new Date().toISOString().slice(0, 10);
  const summary = readinessSummary(items, today);
  const byCategory = READINESS_CATEGORIES.map((c) => ({ category: c, items: items.filter((i) => i.category === c) })).filter((g) => g.items.length > 0);

  return (
    <>
      <PageHeader
        title="Investor readiness"
        description="What investors will ask for, and where you stand on each. Only you mark an item Ready."
        actions={
          <>
            <ExportMenu exportId="funding.readiness" businessSlug={businessSlug} />
            {canManage ? (
              <ActionForm action={addStandardReadinessAction.bind(null, businessId)} inline submitLabel="Add standard checklist" variant="outline" />
            ) : null}
          </>
        }
      />

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Tile label="Completion" value={summary.completion === null ? "—" : `${Math.round(summary.completion * 100)}%`} hint="Ready ÷ items that apply" />
        <Tile label="Ready" value={String(summary.ready)} />
        <Tile label="Needs attention" value={String(summary.needsAttention)} />
        <Tile label="Missing" value={String(summary.missing)} />
        <Tile label="Overdue" value={String(summary.overdue)} />
      </section>

      {items.length === 0 ? (
        <Card>
          <CardContent className="py-10">
            <EmptyState icon={ClipboardCheck} message="No checklist yet. Add the standard one, or your own items below." />
          </CardContent>
        </Card>
      ) : (
        byCategory.map((group) => (
          <Card key={group.category}>
            <CardHeader>
              <CardTitle>{READINESS_CATEGORY_LABEL[group.category]}</CardTitle>
              <CardDescription>
                {group.items.filter((i) => i.status === "ready").length} of {group.items.filter((i) => i.status !== "not_applicable").length} ready
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="divide-y">
                {group.items.map((item) => (
                  <ReadinessRow key={item.id} item={item} businessId={businessId} canManage={canManage} today={today} />
                ))}
              </ul>
            </CardContent>
          </Card>
        ))
      )}

      {canManage ? (
        <Card>
          <CardHeader>
            <CardTitle>Add an item</CardTitle>
          </CardHeader>
          <CardContent>
            <ActionForm action={createReadinessAction.bind(null, businessId)} submitLabel="Add" resetOnSuccess>
              <ReadinessFields />
            </ActionForm>
          </CardContent>
        </Card>
      ) : null}
    </>
  );
}

function Tile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-2xl font-semibold tabular-nums">{value}</p>
      {hint ? <p className="text-[11px] text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function ReadinessFields({ item }: { item?: ReadinessItem }) {
  const evidence = item?.evidence[0];
  const prefix = item ? `r-${item.id}-` : "r-new-";
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-[1fr_2fr]">
        <Field label="Category" htmlFor={`${prefix}category`}>
          <NativeSelect id={`${prefix}category`} name="category" defaultValue={item?.category ?? "company"}>
            {READINESS_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {READINESS_CATEGORY_LABEL[c]}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Item" htmlFor={`${prefix}title`}>
          <Input id={`${prefix}title`} name="title" required maxLength={300} defaultValue={item?.title ?? ""} />
        </Field>
      </div>
      <Field label="Description" htmlFor={`${prefix}description`}>
        <Textarea id={`${prefix}description`} name="description" rows={2} defaultValue={item?.description ?? ""} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Evidence" htmlFor={`${prefix}evidenceNote`} hint="What shows this is done.">
          <Input id={`${prefix}evidenceNote`} name="evidenceNote" defaultValue={evidence?.note ?? ""} />
        </Field>
        <Field label="Evidence link" htmlFor={`${prefix}evidenceUrl`}>
          <Input id={`${prefix}evidenceUrl`} name="evidenceUrl" type="url" placeholder="https://" defaultValue={evidence?.url ?? ""} />
        </Field>
        <Field label="Missing information" htmlFor={`${prefix}missing`}>
          <Input id={`${prefix}missing`} name="missingInformation" defaultValue={item?.missingInformation ?? ""} />
        </Field>
        <Field label="Due" htmlFor={`${prefix}dueAt`}>
          <Input id={`${prefix}dueAt`} name="dueAt" type="date" defaultValue={item?.dueAt ?? ""} />
        </Field>
      </div>
      <Field label="Next step" htmlFor={`${prefix}recommendedAction`}>
        <Input id={`${prefix}recommendedAction`} name="recommendedAction" defaultValue={item?.recommendedAction ?? ""} />
      </Field>
    </>
  );
}

function ReadinessRow({ item, businessId, canManage, today }: { item: ReadinessItem; businessId: string; canManage: boolean; today: string }) {
  const overdue = item.dueAt && item.dueAt < today && item.status !== "ready" && item.status !== "not_applicable";
  return (
    <li className="flex flex-col gap-2 py-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-medium">{item.title}</p>
          {item.description ? <p className="text-sm text-muted-foreground">{item.description}</p> : null}
          <p className="text-xs text-muted-foreground">
            {item.dueAt ? <span className={overdue ? "font-medium text-destructive" : ""}>Due {item.dueAt}</span> : null}
            {item.lastReviewedAt ? ` · reviewed ${item.lastReviewedAt.slice(0, 10)}` : ""}
            {item.evidence.length > 0 ? ` · ${item.evidence.length} evidence` : ""}
          </p>
        </div>
        <ReadinessBadge status={item.status} />
      </div>
      {canManage ? (
        <div className="flex flex-wrap items-start gap-2">
          <TransitionButtons
            action={setReadinessStatusAction.bind(null, businessId, item.id)}
            targets={READINESS_STATUSES.filter((s) => s !== item.status)}
            labels={{ ready: "Mark ready", needs_attention: "Needs attention", missing: "Missing", not_applicable: "Not applicable" }}
          />
          <details className="w-full">
            <summary className="cursor-pointer text-xs text-muted-foreground">Edit</summary>
            <div className="mt-3 flex flex-col gap-3">
              <ActionForm action={updateReadinessAction.bind(null, businessId, item.id)} submitLabel="Save">
                <ReadinessFields item={item} />
              </ActionForm>
              <ActionForm
                action={deleteReadinessAction.bind(null, businessId, item.id)}
                inline
                submitLabel="Remove item"
                variant="ghost"
                confirm={`Remove "${item.title}" from the checklist?`}
              />
            </div>
          </details>
        </div>
      ) : null}
      {item.status !== "ready" && READINESS_STATUS_LABEL[item.status] && item.recommendedAction ? (
        <p className="text-xs">Next step: {item.recommendedAction}</p>
      ) : null}
    </li>
  );
}
