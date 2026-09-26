import type { ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@cofounderai/core/ui/page-header";
import { ExportMenu } from "@cofounderai/core/export-ui/export-menu";
import { Button } from "@cofounderai/core/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@cofounderai/core/ui/card";
import { Input } from "@cofounderai/core/ui/input";
import { Textarea } from "@cofounderai/core/ui/textarea";
import { NativeSelect } from "@cofounderai/core/ui/native-select";
import { StatusBadge } from "@cofounderai/core/ui/status-badge";
import {
  getInvestor,
  listInteractions,
  listInvestorContacts,
  listOutreach,
  listPipeline,
  listResearch,
  listRounds,
} from "@cofounderai/module-discovery/lib/funding/queries";
import { formatAmount, RESEARCH_FRESHNESS_DAYS, researchState } from "@cofounderai/module-discovery/lib/funding/metrics";
import {
  INTERACTION_TYPES,
  INTERACTION_TYPE_LABEL,
  INVESTOR_SOURCE_LABEL,
  INVESTOR_TYPE_LABEL,
  PROVENANCES,
  PROVENANCE_LABEL,
  RESEARCH_FIELDS,
  RESEARCH_FIELD_LABEL,
} from "@cofounderai/module-discovery/lib/funding/types";
import { ActionForm } from "@cofounderai/module-discovery/components/marketing/action-form";
import { Field } from "@cofounderai/module-discovery/components/marketing/field";
import { LocalDateTimeInput } from "@cofounderai/module-discovery/components/marketing/local-datetime-input";
import { InvestorFields } from "@cofounderai/module-discovery/components/funding/investor-fields";
import { StageMoveForm } from "@cofounderai/module-discovery/components/funding/stage-move";
import { OutreachBadge, StageBadge } from "@cofounderai/module-discovery/components/funding/status";
import {
  addContactAction,
  addResearchAction,
  addToRoundAction,
  deleteResearchAction,
  draftOutreachWithAiAction,
  researchInvestorWithAiAction,
  logInteractionAction,
  moveStageAction,
  setInvestorStatusAction,
  updateInvestorAction,
  updatePlanAction,
} from "../../actions";
import { fundingContext } from "../../context";

/**
 * FND-07..10 — one investor: research (each finding labelled Source-backed, User-entered
 * or AI-inferred, and flagged stale past the freshness window), contacts (the platform's
 * shared contact records), their pipeline in each round, interactions and outreach.
 */
export default async function InvestorPage({ params }: { params: Promise<{ businessSlug: string; investorId: string }> }) {
  const { businessSlug, investorId } = await params;
  const { businessId, root, canView, canManage } = await fundingContext(businessSlug);
  if (!canView) return null;
  const investor = await getInvestor(businessId, investorId);
  if (!investor) notFound();
  const [contacts, research, pipeline, rounds, interactions, outreach] = await Promise.all([
    listInvestorContacts(businessId, investor.partyId),
    listResearch(businessId, investor.id),
    listPipeline(businessId, { investorId: investor.id }),
    listRounds(businessId),
    listInteractions(businessId, { investorId: investor.id }),
    listOutreach(businessId, { investorId: investor.id }),
  ]);
  const now = new Date();
  const state = researchState(investor, now);
  const roundName = new Map(rounds.map((r) => [r.id, r.name]));
  const openRounds = rounds.filter((r) => ["planning", "open", "paused"].includes(r.status) && !pipeline.some((p) => p.roundId === r.id));
  const staleCutoff = now.getTime() - RESEARCH_FRESHNESS_DAYS * 86_400_000;

  return (
    <>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-2">
            {investor.name}
            {investor.status === "archived" ? <StatusBadge status="archived" /> : null}
          </span>
        }
        description={`${INVESTOR_TYPE_LABEL[investor.investorType]} · found via ${INVESTOR_SOURCE_LABEL[investor.source].toLowerCase()}${investor.sourceNote ? ` (${investor.sourceNote})` : ""}`}
        breadcrumbs={[{ label: "Investors", href: `${root}/investors` }, { label: investor.name }]}
        actions={
          <>
            <ExportMenu exportId="funding.investor" businessSlug={businessSlug} params={{ investorId: investor.id }} kind="report" />
            {canManage ? (
              <>
                <Button asChild size="sm">
                  <Link href={`${root}/outreach/new?investor=${investor.id}`}>Draft outreach</Link>
                </Button>
                <ActionForm
                  action={setInvestorStatusAction.bind(null, businessId, investor.id)}
                  inline
                  submitLabel={investor.status === "archived" ? "Restore" : "Archive"}
                  variant="outline"
                >
                  <input type="hidden" name="to" value={investor.status === "archived" ? "active" : "archived"} />
                </ActionForm>
              </>
            ) : null}
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>In rounds</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {pipeline.length === 0 ? <p className="text-sm text-muted-foreground">Not in any round yet.</p> : null}
              {pipeline.map((p) => (
                <div key={p.id} className="flex flex-col gap-2 rounded-lg border p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Link href={`${root}/rounds/${p.roundId}`} className="font-medium hover:underline">
                      {roundName.get(p.roundId) ?? "Round"}
                    </Link>
                    <StageBadge stage={p.stage} />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Since {p.stageEnteredAt.slice(0, 10)}
                    {p.committedAmount !== null ? ` · committed ${formatAmount(p.committedAmount, p.currency)}` : ""}
                    {p.investedAmount !== null ? ` · received ${formatAmount(p.investedAmount, p.currency)}` : ""}
                    {p.lastInteractionAt ? ` · last contact ${p.lastInteractionAt.slice(0, 10)}` : ""}
                  </p>
                  {canManage ? (
                    <>
                      <details>
                        <summary className="cursor-pointer text-xs text-muted-foreground">Move stage</summary>
                        <div className="mt-2">
                          <StageMoveForm record={p} action={moveStageAction.bind(null, businessId, p.id)} />
                        </div>
                      </details>
                      <details>
                        <summary className="cursor-pointer text-xs text-muted-foreground">Next action and fit</summary>
                        <div className="mt-2">
                          <ActionForm action={updatePlanAction.bind(null, businessId, p.id)} submitLabel="Save" size="sm">
                            <div className="grid gap-3 sm:grid-cols-[2fr_1fr]">
                              <Field label="Next action" htmlFor={`na-${p.id}`}>
                                <Input id={`na-${p.id}`} name="nextAction" defaultValue={p.nextAction ?? ""} />
                              </Field>
                              <Field label="Due" htmlFor={`nd-${p.id}`}>
                                <Input id={`nd-${p.id}`} name="nextActionDue" type="date" defaultValue={p.nextActionDue ?? ""} />
                              </Field>
                            </div>
                            <Field label="Fit summary" htmlFor={`fit-${p.id}`}>
                              <Textarea id={`fit-${p.id}`} name="fitSummary" rows={2} defaultValue={p.fitSummary ?? ""} />
                            </Field>
                            <Field label="Notes" htmlFor={`pn-${p.id}`}>
                              <Textarea id={`pn-${p.id}`} name="notes" rows={2} defaultValue={p.notes ?? ""} />
                            </Field>
                          </ActionForm>
                        </div>
                      </details>
                    </>
                  ) : null}
                </div>
              ))}
              {canManage && openRounds.length > 0 ? (
                <ActionForm action={addToRoundAction.bind(null, businessId, investor.id)} submitLabel="Add to round" size="sm" variant="outline">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Round" htmlFor="add-round">
                      <NativeSelect id="add-round" name="roundId" defaultValue={openRounds[0]!.id}>
                        {openRounds.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.name}
                          </option>
                        ))}
                      </NativeSelect>
                    </Field>
                    <Field label="Starting stage" htmlFor="add-stage">
                      <NativeSelect id="add-stage" name="stage" defaultValue="identified">
                        <option value="identified">Identified</option>
                        <option value="researched">Researched</option>
                        <option value="target">Target</option>
                        <option value="contacted">Contacted</option>
                        <option value="meeting">Meeting</option>
                      </NativeSelect>
                    </Field>
                  </div>
                </ActionForm>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Research</CardTitle>
              <CardDescription>
                {state === "stale"
                  ? `Last researched ${investor.lastResearchedAt?.slice(0, 10)} — older than ${RESEARCH_FRESHNESS_DAYS} days, so treat it as possibly out of date.`
                  : state === "researched"
                    ? `Last researched ${investor.lastResearchedAt?.slice(0, 10)}.`
                    : "No research yet."}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {research.length > 0 ? (
                <ul className="flex flex-col gap-3">
                  {research.map((r) => (
                    <li key={r.id} className="rounded-lg border p-3 text-sm">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-medium">{RESEARCH_FIELD_LABEL[r.field]}</span>
                        <span className="flex items-center gap-2">
                          <StatusBadge
                            status={r.provenance}
                            label={PROVENANCE_LABEL[r.provenance]}
                            tone={r.provenance === "source_backed" ? "success" : r.provenance === "ai_inferred" ? "warning" : "secondary"}
                          />
                          {new Date(r.observedAt).getTime() < staleCutoff ? <StatusBadge status="stale" tone="warning" /> : null}
                        </span>
                      </div>
                      <p className="mt-1 whitespace-pre-wrap">{r.content}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {r.observedAt.slice(0, 10)}
                        {r.sourceUrl ? (
                          <>
                            {" · "}
                            <a href={r.sourceUrl} target="_blank" rel="noopener noreferrer" className="break-all text-primary hover:underline">
                              {r.sourceTitle ?? r.sourceUrl}
                            </a>
                          </>
                        ) : null}
                      </p>
                      {canManage ? (
                        <div className="mt-2">
                          <ActionForm action={deleteResearchAction.bind(null, businessId, r.id)} inline submitLabel="Remove" variant="ghost" confirm="Remove this finding?" />
                        </div>
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : null}
              {canManage ? (
                <ActionForm
                  action={researchInvestorWithAiAction.bind(null, businessId, investor.id)}
                  submitLabel="Research with AI"
                  pendingText="Researching the web..."
                  size="sm"
                  variant="secondary"
                  className="gap-2"
                >
                  <p className="text-xs text-muted-foreground">
                    Searches the web. Findings with a source link are marked source-backed; everything else is marked AI-inferred.
                  </p>
                </ActionForm>
              ) : null}
              {canManage ? (
                <details className="rounded-lg border p-3">
                  <summary className="cursor-pointer text-sm font-medium">Add a finding</summary>
                  <div className="mt-3">
                    <ActionForm action={addResearchAction.bind(null, businessId, investor.id)} submitLabel="Save finding" resetOnSuccess>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <Field label="About" htmlFor="rs-field">
                          <NativeSelect id="rs-field" name="field" defaultValue="thesis">
                            {RESEARCH_FIELDS.map((f) => (
                              <option key={f} value={f}>
                                {RESEARCH_FIELD_LABEL[f]}
                              </option>
                            ))}
                          </NativeSelect>
                        </Field>
                        <Field label="Where it comes from" htmlFor="rs-prov">
                          <NativeSelect id="rs-prov" name="provenance" defaultValue="user_entered">
                            {PROVENANCES.filter((pv) => pv !== "ai_inferred").map((pv) => (
                              <option key={pv} value={pv}>
                                {PROVENANCE_LABEL[pv]}
                              </option>
                            ))}
                          </NativeSelect>
                        </Field>
                      </div>
                      <Field label="Finding" htmlFor="rs-content">
                        <Textarea id="rs-content" name="content" rows={3} required />
                      </Field>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <Field label="Source link" htmlFor="rs-url" hint="Required for source-backed findings.">
                          <Input id="rs-url" name="sourceUrl" type="url" placeholder="https://" />
                        </Field>
                        <Field label="Source title" htmlFor="rs-title">
                          <Input id="rs-title" name="sourceTitle" />
                        </Field>
                      </div>
                    </ActionForm>
                  </div>
                </details>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Interactions</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {interactions.length === 0 ? <p className="text-sm text-muted-foreground">No interactions logged.</p> : null}
              <ol className="flex flex-col gap-2 border-l pl-4">
                {interactions.map((i) => (
                  <li key={i.id} className="relative text-sm">
                    <span className="absolute top-1.5 -left-[1.3rem] size-2 rounded-full bg-primary" aria-hidden="true" />
                    <p className="font-medium">
                      {INTERACTION_TYPE_LABEL[i.interactionType]}
                      {i.subject ? ` — ${i.subject}` : ""}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(i.occurredAt).toLocaleString("en-IN")}
                      {i.source === "outreach" ? " · sent from outreach" : ""}
                    </p>
                    {i.notes ? <p className="mt-1 whitespace-pre-wrap text-muted-foreground">{i.notes}</p> : null}
                    {i.outcome ? <p className="mt-1">Outcome: {i.outcome}</p> : null}
                    {i.nextAction ? <p className="text-xs">Next: {i.nextAction}{i.nextActionDue ? ` by ${i.nextActionDue}` : ""}</p> : null}
                  </li>
                ))}
              </ol>
              {canManage ? (
                <details className="rounded-lg border p-3">
                  <summary className="cursor-pointer text-sm font-medium">Log an interaction</summary>
                  <div className="mt-3">
                    <ActionForm action={logInteractionAction.bind(null, businessId)} submitLabel="Log" resetOnSuccess>
                      <input type="hidden" name="investorId" value={investor.id} />
                      <div className="grid gap-3 sm:grid-cols-3">
                        <Field label="Type" htmlFor="ix-type">
                          <NativeSelect id="ix-type" name="interactionType" defaultValue="meeting">
                            {INTERACTION_TYPES.map((t) => (
                              <option key={t} value={t}>
                                {INTERACTION_TYPE_LABEL[t]}
                              </option>
                            ))}
                          </NativeSelect>
                        </Field>
                        <Field label="When" htmlFor="ix-when">
                          <LocalDateTimeInput id="ix-when" name="occurredAt" required />
                        </Field>
                        <Field label="Round" htmlFor="ix-round">
                          <NativeSelect id="ix-round" name="roundId" defaultValue={pipeline[0]?.roundId ?? ""}>
                            <option value="">None</option>
                            {rounds.map((r) => (
                              <option key={r.id} value={r.id}>
                                {r.name}
                              </option>
                            ))}
                          </NativeSelect>
                        </Field>
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <Field label="With" htmlFor="ix-contact">
                          <NativeSelect id="ix-contact" name="contactId" defaultValue="">
                            <option value="">—</option>
                            {contacts.map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.name}
                              </option>
                            ))}
                          </NativeSelect>
                        </Field>
                        <Field label="Subject" htmlFor="ix-subject">
                          <Input id="ix-subject" name="subject" />
                        </Field>
                      </div>
                      <Field label="Notes" htmlFor="ix-notes">
                        <Textarea id="ix-notes" name="notes" rows={3} />
                      </Field>
                      <div className="grid gap-3 sm:grid-cols-3">
                        <Field label="Outcome" htmlFor="ix-outcome">
                          <Input id="ix-outcome" name="outcome" />
                        </Field>
                        <Field label="Next action" htmlFor="ix-next">
                          <Input id="ix-next" name="nextAction" />
                        </Field>
                        <Field label="Next action due" htmlFor="ix-due">
                          <Input id="ix-due" name="nextActionDue" type="date" />
                        </Field>
                      </div>
                    </ActionForm>
                  </div>
                </details>
              ) : null}
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Profile</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="flex flex-col gap-2 text-sm">
                <Row label="Stages" value={investor.stages.join(", ") || "—"} />
                <Row label="Sectors" value={investor.sectors.join(", ") || "—"} />
                <Row label="Geographies" value={investor.geographies.join(", ") || "—"} />
                <Row
                  label="Cheque size"
                  value={
                    investor.checkMin !== null || investor.checkMax !== null
                      ? `${formatAmount(investor.checkMin, investor.currency)} – ${formatAmount(investor.checkMax, investor.currency)}`
                      : "—"
                  }
                />
                <Row label="Email" value={investor.email ?? "—"} />
                {investor.website ? (
                  <Row
                    label="Website"
                    value={
                      <a href={investor.website} target="_blank" rel="noopener noreferrer" className="break-all text-primary hover:underline">
                        {investor.website}
                      </a>
                    }
                  />
                ) : null}
                {investor.notes ? <Row label="Notes" value={investor.notes} /> : null}
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Contacts</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {contacts.length === 0 ? <p className="text-sm text-muted-foreground">No contacts yet.</p> : null}
              <ul className="flex flex-col gap-2 text-sm">
                {contacts.map((c) => (
                  <li key={c.id}>
                    <p className="font-medium">
                      {c.name}
                      {c.isPrimary ? <span className="ml-1 text-xs text-muted-foreground">primary</span> : null}
                    </p>
                    <p className="text-xs text-muted-foreground">{[c.jobTitle, c.email].filter(Boolean).join(" · ") || "—"}</p>
                  </li>
                ))}
              </ul>
              {canManage ? (
                <details className="rounded-lg border p-3">
                  <summary className="cursor-pointer text-sm font-medium">Add a contact</summary>
                  <div className="mt-3">
                    <ActionForm action={addContactAction.bind(null, businessId, investor.id)} submitLabel="Add" resetOnSuccess>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <Field label="First name" htmlFor="ct-first">
                          <Input id="ct-first" name="firstName" required />
                        </Field>
                        <Field label="Last name" htmlFor="ct-last">
                          <Input id="ct-last" name="lastName" />
                        </Field>
                      </div>
                      <Field label="Title" htmlFor="ct-title">
                        <Input id="ct-title" name="jobTitle" placeholder="Partner" />
                      </Field>
                      <Field label="Email" htmlFor="ct-email">
                        <Input id="ct-email" name="email" type="email" />
                      </Field>
                      <Field label="LinkedIn" htmlFor="ct-li">
                        <Input id="ct-li" name="linkedinUrl" type="url" placeholder="https://" />
                      </Field>
                    </ActionForm>
                  </div>
                </details>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Outreach</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {canManage ? (
                <ActionForm
                  action={draftOutreachWithAiAction.bind(null, businessId, investor.id)}
                  submitLabel="Draft with AI"
                  pendingText="Drafting..."
                  size="sm"
                  variant="secondary"
                  className="gap-2"
                >
                  <NativeSelect name="roundId" defaultValue={pipeline[0]?.roundId ?? ""} aria-label="Round">
                    <option value="">No round</option>
                    {rounds.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                  </NativeSelect>
                  <NativeSelect name="contactId" defaultValue={contacts[0]?.id ?? ""} aria-label="Contact">
                    <option value="">General email</option>
                    {contacts.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </NativeSelect>
                  <p className="text-xs text-muted-foreground">Uses your funding profile and this investor&apos;s research. Saved as a draft; it needs approval before it can be sent.</p>
                </ActionForm>
              ) : null}
              {outreach.length === 0 ? (
                <p className="text-sm text-muted-foreground">No outreach yet.</p>
              ) : (
                <ul className="flex flex-col gap-2 text-sm">
                  {outreach.map((o) => (
                    <li key={o.id} className="flex items-center justify-between gap-2">
                      <Link href={`${root}/outreach/${o.id}`} className="truncate hover:underline">
                        {o.subject}
                      </Link>
                      <OutreachBadge status={o.status} />
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          {canManage ? (
            <Card>
              <CardHeader>
                <CardTitle>Edit investor</CardTitle>
              </CardHeader>
              <CardContent>
                <ActionForm action={updateInvestorAction.bind(null, businessId, investor.id)} submitLabel="Save">
                  <InvestorFields investor={investor} />
                </ActionForm>
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>
    </>
  );
}

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="whitespace-pre-wrap">{value}</dd>
    </div>
  );
}
