"use client";

import { useState, useTransition } from "react";
import { X } from "lucide-react";
import { Badge } from "@cofounderai/core/ui/badge";
import { Button } from "@cofounderai/core/ui/button";
import { Input } from "@cofounderai/core/ui/input";
import { Label } from "@cofounderai/core/ui/label";
import { SubmitButton } from "@cofounderai/core/ui/submit-button";
import { EmptyState } from "@cofounderai/core/ui/empty-state";
import { NativeSelect } from "@cofounderai/core/ui/native-select";
import { Textarea } from "@cofounderai/core/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@cofounderai/core/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@cofounderai/core/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@cofounderai/core/ui/alert-dialog";
import { formatDateTime } from "@cofounderai/core/lib/format";
import type { CustomFieldWithValue } from "../../lib/custom-fields/types";
import type { Expense } from "../../lib/expenses/types";
import type { JobAttachmentItem } from "../../lib/attachments/types";
import type { AuditLogEntry, Job, JobPartsShortageResolution, JobStatus } from "../../lib/jobs/types";
import type { NoteItem, NoteVisibility } from "../../lib/notes/types";
import type { SignatureItem } from "../../lib/signatures/types";
import type { Tag } from "../../lib/tags/types";
import type { OpenTimeEntry, TimeEntryItem } from "../../lib/time-entries/types";
import type { Message } from "@cofounderai/core/messages/types";
import type { JobMaterialRequirementLine } from "../../lib/inventory-integration/queries";
import { FieldWorkTab } from "../field/field-work-tab";
import { MessagesTab } from "../messages/messages-tab";

const STATUS_LABEL: Record<JobStatus, string> = {
  unscheduled: "Unscheduled",
  scheduled: "Scheduled",
  in_progress: "In Progress",
  on_hold: "On Hold",
  completed: "Completed",
  cancelled: "Cancelled",
};

const ACTION_LABEL: Record<string, string> = {
  "job.status_changed": "Status changed",
};

const RESERVATION_STATUS_LABEL: Record<NonNullable<Job["parts_reservation_status"]>, string> = {
  reserved: "Reserved",
  partially_reserved: "Partially reserved",
  unavailable: "Unavailable",
};

const SHORTAGE_RESOLUTION_LABEL: Record<JobPartsShortageResolution, string> = {
  await_replenishment: "Wait for replenishment",
  substitute_item: "Substitute item",
  reschedule_job: "Reschedule the job",
  obtain_manually: "Obtain manually (outside this system)",
};

export function JobDetail({
  job,
  partyName,
  serviceTypeName,
  tags,
  customFields,
  auditLog,
  canEdit,
  canReopen,
  canConvertToOpportunity,
  timeEntries,
  openTimeEntry,
  expenses,
  notes,
  attachments,
  signatures,
  canEditTime,
  canEditExpenses,
  canEditNotes,
  updateAction,
  addTagAction,
  removeTagAction,
  setCustomFieldAction,
  markScheduledAction,
  startAction,
  holdAction,
  resumeAction,
  completeAction,
  cancelAction,
  reopenAction,
  duplicateAction,
  convertToOpportunityAction,
  invoiceAction,
  sendCustomerCenterAccessAction,
  clockInAction,
  clockOutAction,
  addExpenseAction,
  deleteExpenseAction,
  addNoteAction,
  uploadAttachmentAction,
  deleteAttachmentAction,
  captureSignatureAction,
  messages,
  canManageMessages,
  sendMessageAction,
  inventoryLicensed,
  materialRequirement,
  resolveShortageAction,
  retryReservationAction,
  recordConsumptionAction,
}: {
  job: Job;
  partyName: string;
  serviceTypeName: string | null;
  tags: Tag[];
  customFields: CustomFieldWithValue[];
  auditLog: AuditLogEntry[];
  canEdit: boolean;
  canReopen: boolean;
  canConvertToOpportunity: boolean;
  timeEntries: TimeEntryItem[];
  openTimeEntry: OpenTimeEntry | null;
  expenses: Expense[];
  notes: NoteItem[];
  attachments: JobAttachmentItem[];
  signatures: SignatureItem[];
  canEditTime: boolean;
  canEditExpenses: boolean;
  canEditNotes: boolean;
  updateAction: (description: string, scopeOfWork: string) => Promise<void>;
  addTagAction: (name: string) => Promise<void>;
  removeTagAction: (tagId: string) => Promise<void>;
  setCustomFieldAction: (fieldDefId: string, value: unknown) => Promise<void>;
  markScheduledAction: () => Promise<void>;
  startAction: () => Promise<void>;
  holdAction: (reason: string) => Promise<void>;
  resumeAction: () => Promise<void>;
  completeAction: () => Promise<void>;
  cancelAction: () => Promise<void>;
  reopenAction: () => Promise<void>;
  duplicateAction: () => Promise<{ id: string }>;
  convertToOpportunityAction: () => Promise<{ id: string }>;
  invoiceAction: () => Promise<{ id: string }>;
  sendCustomerCenterAccessAction: () => Promise<void>;
  clockInAction: () => Promise<void>;
  clockOutAction: () => Promise<void>;
  addExpenseAction: (description: string, amount: number) => Promise<void>;
  deleteExpenseAction: (id: string) => Promise<void>;
  addNoteAction: (body: string, visibility: NoteVisibility) => Promise<void>;
  uploadAttachmentAction: (formData: FormData) => Promise<void>;
  deleteAttachmentAction: (id: string) => Promise<void>;
  captureSignatureAction: (formData: FormData) => Promise<void>;
  messages: Message[];
  canManageMessages: boolean;
  sendMessageAction: (body: string, subject?: string) => Promise<void>;
  inventoryLicensed: boolean;
  materialRequirement: JobMaterialRequirementLine[];
  resolveShortageAction: (resolution: JobPartsShortageResolution, note: string) => Promise<void>;
  retryReservationAction: () => Promise<void>;
  recordConsumptionAction: (lines: { itemId: string; actual: number; returned: number; wasted: number }[]) => Promise<void>;
}) {
  const [pending, startTransition] = useTransition();
  const [description, setDescription] = useState(job.description ?? "");
  const [scopeOfWork, setScopeOfWork] = useState(job.scope_of_work ?? "");
  const [newTag, setNewTag] = useState("");
  const [holdOpen, setHoldOpen] = useState(false);
  const [holdReason, setHoldReason] = useState("");
  const [shortageResolution, setShortageResolution] = useState<JobPartsShortageResolution>(job.parts_shortage_resolution ?? "await_replenishment");
  const [shortageNote, setShortageNote] = useState(job.parts_shortage_resolution_note ?? "");
  const [consumption, setConsumption] = useState<Record<string, { actual: string; returned: string; wasted: string }>>(() => {
    const byItemId = new Map((job.parts_consumption ?? []).map((l) => [l.itemId, l]));
    const initial: Record<string, { actual: string; returned: string; wasted: string }> = {};
    for (const line of materialRequirement) {
      const recorded = byItemId.get(line.itemId);
      initial[line.itemId] = {
        actual: String(recorded?.actual ?? line.quantity),
        returned: String(recorded?.returned ?? 0),
        wasted: String(recorded?.wasted ?? 0),
      };
    }
    return initial;
  });
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const run = (fn: () => Promise<void>, onSuccessNotice?: string) => {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      try {
        await fn();
        if (onSuccessNotice) setNotice(onSuccessNotice);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong.");
      }
    });
  };

  const navigate = (fn: () => Promise<{ id: string }>, buildHref: (id: string) => string) => {
    setError(null);
    startTransition(async () => {
      try {
        const { id } = await fn();
        window.location.href = buildHref(id);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong.");
      }
    });
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 sm:flex-row sm:items-start sm:justify-between sm:p-6">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold break-words">{partyName}</h1>
            <Badge variant={job.status === "cancelled" ? "destructive" : job.status === "completed" ? "default" : "secondary"}>
              {STATUS_LABEL[job.status]}
            </Badge>
          </div>
          {job.number ? <p className="mt-1 text-xs text-muted-foreground">{job.number}</p> : null}
          {serviceTypeName ? <p className="mt-1 text-sm text-muted-foreground">{serviceTypeName}</p> : null}
          <p className="mt-1 text-xs text-muted-foreground">Created {formatDateTime(job.created_at)}</p>
        </div>

        {canEdit ? (
          <div className="flex flex-wrap items-center gap-2 sm:justify-end">
            {job.status === "unscheduled" ? (
              <Button variant="outline" size="sm" disabled={pending} onClick={() => run(markScheduledAction)}>
                Mark scheduled
              </Button>
            ) : null}
            {job.status === "scheduled" ? (
              <Button variant="outline" size="sm" disabled={pending} onClick={() => run(startAction)}>
                Start job
              </Button>
            ) : null}
            {job.status === "in_progress" ? (
              <Button variant="outline" size="sm" disabled={pending} onClick={() => setHoldOpen(true)}>
                Put on hold
              </Button>
            ) : null}
            {job.status === "on_hold" ? (
              <Button variant="outline" size="sm" disabled={pending} onClick={() => run(resumeAction)}>
                Resume
              </Button>
            ) : null}
            {job.status === "in_progress" || job.status === "on_hold" ? (
              <Button size="sm" disabled={pending} onClick={() => run(completeAction)}>
                Complete
              </Button>
            ) : null}
            {job.status === "completed" && canReopen ? (
              <Button variant="outline" size="sm" disabled={pending} onClick={() => run(reopenAction)}>
                Reopen
              </Button>
            ) : null}
            <Button
              variant="outline"
              size="sm"
              disabled={pending}
              onClick={() => navigate(duplicateAction, (id) => `/dashboard/businesses/${job.business_id}/fsm/jobs/${id}`)}
            >
              Duplicate
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={pending}
              onClick={() => navigate(invoiceAction, (id) => `/dashboard/businesses/${job.business_id}/fsm/invoices/${id}`)}
            >
              Invoice
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={pending}
              onClick={() => run(sendCustomerCenterAccessAction, "Customer Center access sent.")}
            >
              Send Customer Center access
            </Button>
            {canConvertToOpportunity ? (
              <Button
                variant="outline"
                size="sm"
                disabled={pending}
                onClick={() => navigate(convertToOpportunityAction, (id) => `/dashboard/businesses/${job.business_id}/fsm/opportunities/${id}`)}
              >
                Convert to opportunity
              </Button>
            ) : null}
            {job.status !== "completed" && job.status !== "cancelled" ? (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" size="sm" disabled={pending}>
                    Cancel
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Cancel this job?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This cancels the job and releases any parts reserved for it back to stock. It
                      cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Keep job</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => run(cancelAction)}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                      Cancel job
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            ) : null}
          </div>
        ) : null}
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {notice ? <p className="text-sm text-muted-foreground">{notice}</p> : null}

      {job.status === "on_hold" && job.on_hold_reason ? (
        <div className="rounded-lg border border-border bg-muted px-4 py-3 text-sm">
          <span className="font-medium">On hold: </span>
          {job.on_hold_reason}
        </div>
      ) : null}

      <Tabs defaultValue="details">
        <TabsList>
          <TabsTrigger value="details">Job details</TabsTrigger>
          <TabsTrigger value="field">Field work</TabsTrigger>
          {inventoryLicensed ? <TabsTrigger value="materials">Materials</TabsTrigger> : null}
          <TabsTrigger value="messages">Messages</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>

        <TabsContent value="details" className="flex flex-col gap-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="job-desc">Internal description</Label>
              <Textarea
                id="job-desc"
                rows={3}
                value={description}
                disabled={!canEdit}
                onChange={(e) => setDescription(e.target.value)}
                onBlur={() => run(() => updateAction(description, scopeOfWork))}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="job-scope">Scope of work (customer-facing)</Label>
              <Textarea
                id="job-scope"
                rows={3}
                value={scopeOfWork}
                disabled={!canEdit}
                onChange={(e) => setScopeOfWork(e.target.value)}
                onBlur={() => run(() => updateAction(description, scopeOfWork))}
              />
            </div>
          </div>

          <div>
            <h2 className="mb-2 text-sm font-semibold text-muted-foreground uppercase">Tags</h2>
            <div className="flex flex-wrap items-center gap-2">
              {tags.map((tag) => (
                <Badge key={tag.id} variant="secondary" className="gap-1 pr-1">
                  {tag.name}
                  {canEdit ? (
                    <button
                      type="button"
                      aria-label={`Remove ${tag.name}`}
                      disabled={pending}
                      onClick={() => run(() => removeTagAction(tag.id))}
                      className="rounded-full p-0.5 hover:bg-muted"
                    >
                      <X className="size-3" />
                    </button>
                  ) : null}
                </Badge>
              ))}
              {canEdit ? (
                <form
                  className="flex items-center gap-1"
                  action={async () => {
                    if (!newTag.trim()) return;
                    setError(null);
                    try {
                      await addTagAction(newTag);
                      setNewTag("");
                    } catch (err) {
                      setError(err instanceof Error ? err.message : "Something went wrong.");
                    }
                  }}
                >
                  <Input value={newTag} onChange={(e) => setNewTag(e.target.value)} placeholder="Add a tag" className="h-7 w-32 text-xs" />
                  <SubmitButton size="sm" variant="ghost" disabled={!newTag.trim()}>
                    Add
                  </SubmitButton>
                </form>
              ) : null}
            </div>
          </div>

          {customFields.length > 0 ? (
            <div>
              <h2 className="mb-2 text-sm font-semibold text-muted-foreground uppercase">Custom fields</h2>
              <div className="grid gap-4 sm:grid-cols-2">
                {customFields.map((field) => (
                  <div key={field.id} className="flex flex-col gap-1.5">
                    <Label htmlFor={`cf-${field.id}`}>{field.label}</Label>
                    <Input
                      id={`cf-${field.id}`}
                      type={field.field_type === "number" ? "number" : field.field_type === "date" ? "date" : "text"}
                      defaultValue={typeof field.value === "string" || typeof field.value === "number" ? field.value : ""}
                      disabled={!canEdit}
                      onBlur={(e) => run(() => setCustomFieldAction(field.id, e.target.value))}
                    />
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </TabsContent>

        <TabsContent value="field">
          <FieldWorkTab
            jobId={job.id}
            timeEntries={timeEntries}
            openTimeEntry={openTimeEntry}
            expenses={expenses}
            notes={notes}
            attachments={attachments}
            signatures={signatures}
            canEditTime={canEditTime}
            canEditExpenses={canEditExpenses}
            canEditNotes={canEditNotes}
            canEditJob={canEdit}
            clockInAction={clockInAction}
            clockOutAction={clockOutAction}
            addExpenseAction={addExpenseAction}
            deleteExpenseAction={deleteExpenseAction}
            addNoteAction={addNoteAction}
            uploadAttachmentAction={uploadAttachmentAction}
            deleteAttachmentAction={deleteAttachmentAction}
            captureSignatureAction={captureSignatureAction}
          />
        </TabsContent>

        {inventoryLicensed ? (
          <TabsContent value="materials" className="flex flex-col gap-3">
            {materialRequirement.length === 0 ? (
              <EmptyState
                variant="inline"
                message="No inventory items required for this job."
              />
            ) : (
              <>
                {job.parts_reservation_status ? (
                  <Badge
                    variant={
                      job.parts_reservation_status === "reserved"
                        ? "secondary"
                        : job.parts_reservation_status === "unavailable"
                          ? "destructive"
                          : "default"
                    }
                    className="w-fit capitalize"
                  >
                    {RESERVATION_STATUS_LABEL[job.parts_reservation_status]}
                  </Badge>
                ) : null}
                <ul className="flex flex-col gap-2">
                  {materialRequirement.map((line) => {
                    const shortfall = job.parts_reservation_detail?.find((d) => d.itemId === line.itemId);
                    return (
                      <li key={line.itemId} className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm">
                        <div className="min-w-0">
                          <p className="truncate font-medium">{line.itemName}</p>
                          {line.itemSku ? <p className="text-xs text-muted-foreground">{line.itemSku}</p> : null}
                          {shortfall ? (
                            <p className="text-xs text-destructive">
                              Short {shortfall.shortfall} {line.unit}
                            </p>
                          ) : null}
                        </div>
                        <span className="text-muted-foreground">
                          {line.quantity} {line.unit}
                        </span>
                      </li>
                    );
                  })}
                </ul>

                {job.parts_reservation_status === "partially_reserved" || job.parts_reservation_status === "unavailable" ? (
                  <div className="flex flex-col gap-3 rounded-lg border border-border p-3">
                    {job.parts_shortage_resolution ? (
                      <p className="text-sm">
                        Resolution: <span className="font-medium">{SHORTAGE_RESOLUTION_LABEL[job.parts_shortage_resolution]}</span>
                        {job.parts_shortage_resolution_note ? <span className="text-muted-foreground"> -- {job.parts_shortage_resolution_note}</span> : null}
                      </p>
                    ) : (
                      <p className="text-sm text-muted-foreground">This job is short on parts. Choose how to handle it.</p>
                    )}
                    {canEdit ? (
                      <>
                        <div className="grid gap-3 sm:grid-cols-2">
                          <div className="flex flex-col gap-1.5">
                            <Label htmlFor="shortage-resolution">Resolution</Label>
                            <NativeSelect
                              id="shortage-resolution"
                              value={shortageResolution}
                              onChange={(e) => setShortageResolution(e.target.value as JobPartsShortageResolution)}
                            >
                              {(Object.entries(SHORTAGE_RESOLUTION_LABEL) as [JobPartsShortageResolution, string][]).map(([value, label]) => (
                                <option key={value} value={value}>
                                  {label}
                                </option>
                              ))}
                            </NativeSelect>
                          </div>
                          <div className="flex flex-col gap-1.5">
                            <Label htmlFor="shortage-note">Note (optional)</Label>
                            <Input id="shortage-note" value={shortageNote} onChange={(e) => setShortageNote(e.target.value)} />
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={pending}
                            onClick={() => run(() => resolveShortageAction(shortageResolution, shortageNote), "Resolution recorded.")}
                          >
                            {job.parts_shortage_resolution ? "Update resolution" : "Record resolution"}
                          </Button>
                          <Button size="sm" disabled={pending} onClick={() => run(retryReservationAction, "Reservation retried.")}>
                            Retry reservation
                          </Button>
                        </div>
                      </>
                    ) : null}
                  </div>
                ) : null}

                {canEdit && (job.status === "in_progress" || job.status === "on_hold" || job.status === "completed") ? (
                  <div className="flex flex-col gap-3 rounded-lg border border-border p-3">
                    <p className="text-sm font-medium">
                      {job.parts_consumption ? "Actual usage" : "Report actual usage"}
                      {job.parts_consumption_recorded_at ? (
                        <span className="ml-2 text-xs font-normal text-muted-foreground">last updated {formatDateTime(job.parts_consumption_recorded_at)}</span>
                      ) : null}
                    </p>
                    <div className="flex flex-col gap-2">
                      {materialRequirement.map((line) => (
                        <div key={line.itemId} className="flex flex-col gap-2 border-b border-border pb-2 last:border-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
                          <p className="text-sm">
                            {line.itemName} <span className="text-xs text-muted-foreground">(planned {line.quantity} {line.unit})</span>
                          </p>
                          <div className="flex gap-2">
                            <div className="flex flex-col gap-1">
                              <Label htmlFor={`actual-${line.itemId}`} className="text-xs text-muted-foreground">
                                Actual
                              </Label>
                              <Input
                                id={`actual-${line.itemId}`}
                                type="number"
                                min={0}
                                className="w-20"
                                value={consumption[line.itemId]?.actual ?? "0"}
                                onChange={(e) => setConsumption((prev) => ({ ...prev, [line.itemId]: { ...prev[line.itemId]!, actual: e.target.value } }))}
                              />
                            </div>
                            <div className="flex flex-col gap-1">
                              <Label htmlFor={`returned-${line.itemId}`} className="text-xs text-muted-foreground">
                                Returned
                              </Label>
                              <Input
                                id={`returned-${line.itemId}`}
                                type="number"
                                min={0}
                                className="w-20"
                                value={consumption[line.itemId]?.returned ?? "0"}
                                onChange={(e) => setConsumption((prev) => ({ ...prev, [line.itemId]: { ...prev[line.itemId]!, returned: e.target.value } }))}
                              />
                            </div>
                            <div className="flex flex-col gap-1">
                              <Label htmlFor={`wasted-${line.itemId}`} className="text-xs text-muted-foreground">
                                Wasted
                              </Label>
                              <Input
                                id={`wasted-${line.itemId}`}
                                type="number"
                                min={0}
                                className="w-20"
                                value={consumption[line.itemId]?.wasted ?? "0"}
                                onChange={(e) => setConsumption((prev) => ({ ...prev, [line.itemId]: { ...prev[line.itemId]!, wasted: e.target.value } }))}
                              />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                    <Button
                      size="sm"
                      className="w-fit"
                      disabled={pending}
                      onClick={() =>
                        run(
                          () =>
                            recordConsumptionAction(
                              materialRequirement.map((line) => ({
                                itemId: line.itemId,
                                actual: Number(consumption[line.itemId]?.actual ?? 0),
                                returned: Number(consumption[line.itemId]?.returned ?? 0),
                                wasted: Number(consumption[line.itemId]?.wasted ?? 0),
                              })),
                            ),
                          "Usage recorded.",
                        )
                      }
                    >
                      {job.parts_consumption ? "Update usage" : "Record usage"}
                    </Button>
                  </div>
                ) : null}
              </>
            )}
          </TabsContent>
        ) : null}

        <TabsContent value="messages">
          <MessagesTab messages={messages} canManage={canManageMessages} sendAction={sendMessageAction} />
        </TabsContent>

        <TabsContent value="history">
          {auditLog.length === 0 ? (
            <EmptyState variant="inline" message="No history yet." />
          ) : (
            <ul className="flex flex-col gap-2">
              {auditLog.map((entry) => (
                <li key={entry.id} className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm">
                  <span>
                    {ACTION_LABEL[entry.action] ?? entry.action}
                    {entry.before && entry.after && "status" in entry.before && "status" in entry.after
                      ? `: ${entry.before.status} -> ${entry.after.status}`
                      : ""}
                  </span>
                  <span className="text-xs text-muted-foreground">{formatDateTime(entry.created_at)}</span>
                </li>
              ))}
            </ul>
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={holdOpen} onOpenChange={setHoldOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Put this job on hold?</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="hold-reason">Reason</Label>
            <Textarea id="hold-reason" rows={3} value={holdReason} onChange={(e) => setHoldReason(e.target.value)} placeholder="Why is this job paused?" />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setHoldOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={pending || !holdReason.trim()}
              onClick={() =>
                run(async () => {
                  await holdAction(holdReason);
                  setHoldOpen(false);
                  setHoldReason("");
                })
              }
            >
              Put on hold
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
