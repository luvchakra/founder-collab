"use client";

import { useState, useTransition } from "react";
import { X } from "lucide-react";
import { Badge } from "@cofounderai/core/ui/badge";
import { Button } from "@cofounderai/core/ui/button";
import { Input } from "@cofounderai/core/ui/input";
import { Label } from "@cofounderai/core/ui/label";
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
}) {
  const [pending, startTransition] = useTransition();
  const [description, setDescription] = useState(opportunity.description ?? "");
  const [scopeOfWork, setScopeOfWork] = useState(opportunity.scope_of_work ?? "");
  const [lostOpen, setLostOpen] = useState(false);
  const [lostReason, setLostReason] = useState("");
  const [newTag, setNewTag] = useState("");
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

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold">{partyName}</h1>
            <Badge variant={opportunity.status === "lost" ? "destructive" : "secondary"}>
              {STATUS_LABEL[opportunity.status]}
            </Badge>
          </div>
          {serviceTypeName ? <p className="mt-1 text-sm text-muted-foreground">{serviceTypeName}</p> : null}
          <p className="mt-1 text-xs text-muted-foreground">Created {formatDateTime(opportunity.created_at)}</p>
        </div>
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

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

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
              onSubmit={(e) => {
                e.preventDefault();
                if (!newTag.trim()) return;
                run(async () => {
                  await addTagAction(newTag);
                  setNewTag("");
                });
              }}
            >
              <Input
                value={newTag}
                onChange={(e) => setNewTag(e.target.value)}
                placeholder="Add a tag"
                className="h-7 w-32 text-xs"
              />
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
