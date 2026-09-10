"use client";

import { useState, useTransition } from "react";
import { X } from "lucide-react";
import { Badge } from "@cofounderai/core/ui/badge";
import { Button } from "@cofounderai/core/ui/button";
import { Input } from "@cofounderai/core/ui/input";
import { Label } from "@cofounderai/core/ui/label";
import { SubmitButton } from "@cofounderai/core/ui/submit-button";
import { Textarea } from "@cofounderai/core/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@cofounderai/core/ui/dialog";
import { formatDateTime } from "@cofounderai/core/lib/format";
import type { CustomFieldWithValue } from "../../lib/custom-fields/types";
import type { Opportunity } from "../../lib/opportunities/types";
import type { Tag } from "../../lib/tags/types";

const STATUS_LABEL: Record<Opportunity["status"], string> = {
  new: "New",
  estimate_scheduled: "Estimate Scheduled",
  estimate_sent: "Estimate Sent",
  won: "Won",
  lost: "Lost",
};

export function OpportunityDetail({
  opportunity,
  partyName,
  serviceTypeName,
  tags,
  customFields,
  canEdit,
  updateAction,
  markLostAction,
  reopenAction,
  addTagAction,
  removeTagAction,
  setCustomFieldAction,
  estimateStatus,
  canSendEstimate,
  canRespondToEstimate,
  sendEstimateAction,
  approveEstimateInternalAction,
  declineEstimateInternalAction,
}: {
  opportunity: Opportunity;
  partyName: string;
  serviceTypeName: string | null;
  tags: Tag[];
  customFields: CustomFieldWithValue[];
  canEdit: boolean;
  updateAction: (description: string, scopeOfWork: string) => Promise<void>;
  markLostAction: (reason: string) => Promise<void>;
  reopenAction: () => Promise<void>;
  addTagAction: (name: string) => Promise<void>;
  removeTagAction: (tagId: string) => Promise<void>;
  setCustomFieldAction: (fieldDefId: string, value: unknown) => Promise<void>;
  /** Estimate document state, read-only here -- EstimateBuilder (rendered separately,
   * below) owns the estimate's own line-editing UI; these three actions are duplicated up
   * here too so every opportunity-level action lives in one bar at the top, matching the
   * FSM job detail page's own convention, instead of leaving "Mark lost" alone up here
   * while the actions that actually move this opportunity toward won/lost sit a full
   * scroll away. */
  estimateStatus: string | null;
  canSendEstimate: boolean;
  canRespondToEstimate: boolean;
  sendEstimateAction: () => Promise<{ error: string } | void>;
  approveEstimateInternalAction: () => Promise<{ error: string } | void>;
  declineEstimateInternalAction: () => Promise<{ error: string } | void>;
}) {
  const [pending, startTransition] = useTransition();
  const [description, setDescription] = useState(opportunity.description ?? "");
  const [scopeOfWork, setScopeOfWork] = useState(opportunity.scope_of_work ?? "");
  const [lostOpen, setLostOpen] = useState(false);
  const [lostReason, setLostReason] = useState("");
  const [newTag, setNewTag] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const run = (fn: () => Promise<void | { error: string }>, onSuccessNotice?: string) => {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      try {
        const result = await fn();
        if (result && "error" in result) {
          setError(result.error);
          return;
        }
        if (onSuccessNotice) setNotice(onSuccessNotice);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong.");
      }
    });
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 sm:flex-row sm:items-start sm:justify-between sm:p-6">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Opportunity</p>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold break-words">{partyName}</h1>
            <Badge variant={opportunity.status === "lost" ? "destructive" : "secondary"}>
              {STATUS_LABEL[opportunity.status]}
            </Badge>
          </div>
          {opportunity.number ? <p className="mt-1 text-xs text-muted-foreground">{opportunity.number}</p> : null}
          {serviceTypeName ? <p className="mt-1 text-sm text-muted-foreground">{serviceTypeName}</p> : null}
          <p className="mt-1 text-xs text-muted-foreground">Created {formatDateTime(opportunity.created_at)}</p>
          {opportunity.source === "discovery" && opportunity.source_prospect_id && opportunity.source_workspace_id ? (
            <a
              href={`/dashboard/businesses/${opportunity.business_id}/products/${opportunity.source_workspace_id}/prospects/${opportunity.source_prospect_id}`}
              className="mt-1 inline-block text-xs text-primary hover:underline"
            >
              From discovery prospect →
            </a>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {canRespondToEstimate ? (
            <>
              <Button
                variant="outline"
                size="sm"
                disabled={pending}
                onClick={() => run(declineEstimateInternalAction, "Estimate marked declined.")}
              >
                Decline internally
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={pending}
                onClick={() => run(approveEstimateInternalAction, "Estimate approved -- a job was created.")}
              >
                Approve internally
              </Button>
            </>
          ) : null}
          {canSendEstimate ? (
            <Button
              variant="outline"
              size="sm"
              disabled={pending}
              onClick={() => run(sendEstimateAction, estimateStatus === "draft" ? "Estimate sent." : "Estimate resent.")}
            >
              {estimateStatus === "draft" ? "Send estimate" : "Resend estimate"}
            </Button>
          ) : null}
          {canEdit && opportunity.status !== "lost" ? (
            <Button variant="destructive" size="sm" disabled={pending} onClick={() => setLostOpen(true)}>
              Mark lost
            </Button>
          ) : null}
          {canEdit && opportunity.status === "lost" ? (
            <Button variant="outline" size="sm" disabled={pending} onClick={() => run(reopenAction)}>
              Reopen
            </Button>
          ) : null}
        </div>
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {notice ? <p className="text-sm text-muted-foreground">{notice}</p> : null}

      {opportunity.status === "lost" && opportunity.lost_reason ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm">
          <span className="font-medium">Lost reason: </span>
          {opportunity.lost_reason}
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="opp-desc">Internal description</Label>
          <Textarea
            id="opp-desc"
            rows={3}
            value={description}
            disabled={!canEdit}
            onChange={(e) => setDescription(e.target.value)}
            onBlur={() => run(() => updateAction(description, scopeOfWork))}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="opp-scope">Scope of work (customer-facing)</Label>
          <Textarea
            id="opp-scope"
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
              <Input
                value={newTag}
                onChange={(e) => setNewTag(e.target.value)}
                placeholder="Add a tag"
                className="h-7 w-32 text-xs"
              />
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

      <Dialog open={lostOpen} onOpenChange={setLostOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mark this opportunity lost?</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="lost-reason">Reason</Label>
            <Textarea
              id="lost-reason"
              rows={3}
              value={lostReason}
              onChange={(e) => setLostReason(e.target.value)}
              placeholder="Why did this opportunity not go through?"
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setLostOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={pending || !lostReason.trim()}
              onClick={() =>
                run(async () => {
                  await markLostAction(lostReason);
                  setLostOpen(false);
                })
              }
            >
              Mark lost
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
