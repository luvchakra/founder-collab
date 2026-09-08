"use client";

import { useState, useTransition } from "react";
import { X } from "lucide-react";
import { Badge } from "@cofounderai/core/ui/badge";
import { Button } from "@cofounderai/core/ui/button";
import { Input } from "@cofounderai/core/ui/input";
import { Label } from "@cofounderai/core/ui/label";
import { Textarea } from "@cofounderai/core/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@cofounderai/core/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@cofounderai/core/ui/dialog";
import { formatDateTime } from "@cofounderai/core/lib/format";
import type { CustomFieldWithValue } from "../../lib/custom-fields/types";
import type { Expense } from "../../lib/expenses/types";
import type { JobAttachmentItem } from "../../lib/attachments/types";
import type { AuditLogEntry, Job, JobStatus } from "../../lib/jobs/types";
import type { NoteItem, NoteVisibility } from "../../lib/notes/types";
import type { SignatureItem } from "../../lib/signatures/types";
import type { Tag } from "../../lib/tags/types";
import type { OpenTimeEntry, TimeEntryItem } from "../../lib/time-entries/types";
import { FieldWorkTab } from "../field/field-work-tab";

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
  clockInAction,
  clockOutAction,
  addExpenseAction,
  deleteExpenseAction,
  addNoteAction,
  uploadAttachmentAction,
  deleteAttachmentAction,
  captureSignatureAction,
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
  clockInAction: () => Promise<void>;
  clockOutAction: () => Promise<void>;
  addExpenseAction: (description: string, amount: number) => Promise<void>;
  deleteExpenseAction: (id: string) => Promise<void>;
  addNoteAction: (body: string, visibility: NoteVisibility) => Promise<void>;
  uploadAttachmentAction: (formData: FormData) => Promise<void>;
  deleteAttachmentAction: (id: string) => Promise<void>;
  captureSignatureAction: (formData: FormData) => Promise<void>;
}) {
  const [pending, startTransition] = useTransition();
  const [description, setDescription] = useState(job.description ?? "");
  const [scopeOfWork, setScopeOfWork] = useState(job.scope_of_work ?? "");
  const [newTag, setNewTag] = useState("");
  const [holdOpen, setHoldOpen] = useState(false);
  const [holdReason, setHoldReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  const run = (fn: () => Promise<void>) => {
    setError(null);
    startTransition(async () => {
      try {
        await fn();
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
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold">{partyName}</h1>
            <Badge variant={job.status === "cancelled" ? "destructive" : job.status === "completed" ? "default" : "secondary"}>
              {STATUS_LABEL[job.status]}
            </Badge>
          </div>
          {job.number ? <p className="mt-1 text-xs text-muted-foreground">{job.number}</p> : null}
          {serviceTypeName ? <p className="mt-1 text-sm text-muted-foreground">{serviceTypeName}</p> : null}
          <p className="mt-1 text-xs text-muted-foreground">Created {formatDateTime(job.created_at)}</p>
        </div>

        {canEdit ? (
          <div className="flex flex-wrap items-center justify-end gap-2">
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
            {job.status !== "completed" && job.status !== "cancelled" ? (
              <Button variant="destructive" size="sm" disabled={pending} onClick={() => run(cancelAction)}>
                Cancel
              </Button>
            ) : null}
            {job.status === "completed" && canReopen ? (
              <Button variant="outline" size="sm" disabled={pending} onClick={() => run(reopenAction)}>
                Reopen
              </Button>
            ) : null}
            <Button
              variant="ghost"
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
            {canConvertToOpportunity ? (
              <Button
                variant="ghost"
                size="sm"
                disabled={pending}
                onClick={() => navigate(convertToOpportunityAction, (id) => `/dashboard/businesses/${job.business_id}/fsm/opportunities/${id}`)}
              >
                Convert to opportunity
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

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
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (!newTag.trim()) return;
                    run(async () => {
                      await addTagAction(newTag);
                      setNewTag("");
                    });
                  }}
                >
                  <Input value={newTag} onChange={(e) => setNewTag(e.target.value)} placeholder="Add a tag" className="h-7 w-32 text-xs" />
                  <Button type="submit" size="sm" variant="ghost" disabled={pending || !newTag.trim()}>
                    Add
                  </Button>
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

        <TabsContent value="history">
          {auditLog.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border px-3 py-8 text-center text-sm text-muted-foreground">
              No history yet.
            </p>
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
