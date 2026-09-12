"use client";

import { useState, useTransition, type FormEvent } from "react";
import { Pencil } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@cofounderai/core/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@cofounderai/core/ui/dialog";
import { Input } from "@cofounderai/core/ui/input";
import { Label } from "@cofounderai/core/ui/label";
import { Textarea } from "@cofounderai/core/ui/textarea";
import type { EmailTemplate } from "@cofounderai/core/admin/platform-email-templates";
import { updateEmailTemplateAction } from "./actions";

// Same hardcoded-dark-chrome overrides every other `/platform` form uses.
const DIALOG_CLASS = "border-zinc-800 bg-zinc-900 text-zinc-50";
const FIELD_CLASS = "border-zinc-700 bg-zinc-950/60 text-zinc-50 placeholder:text-zinc-500";
const LABEL_CLASS = "text-zinc-300";

/**
 * PLATFORM-P0-11.2 (System Email Templates, config-only). Edit only -- the seven templates
 * are a fixed catalog (see the migration's own docstring), so there is no Add dialog, and
 * `templateKey` is never editable here.
 */
export function EmailTemplateDialog({ template }: { template: EmailTemplate }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [reason, setReason] = useState("");

  function resetOnOpen(next: boolean) {
    setOpen(next);
    setFieldErrors({});
    setReason("");
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(async () => {
      const result = await updateEmailTemplateAction({
        templateKey: template.templateKey,
        subject: String(formData.get("subject") ?? ""),
        body: String(formData.get("body") ?? ""),
        reason,
      });
      if (!result.ok) {
        setFieldErrors(result.fieldErrors ?? {});
        toast.error(result.error);
        return;
      }
      setFieldErrors({});
      toast.success(`"${template.label}" template updated.`);
      resetOnOpen(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={resetOnOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="text-zinc-300 hover:bg-zinc-800 hover:text-zinc-50">
          <Pencil className="size-4" aria-hidden="true" />
          Edit
        </Button>
      </DialogTrigger>
      <DialogContent className={`${DIALOG_CLASS} max-w-lg`}>
        <DialogHeader>
          <DialogTitle>
            Edit &quot;{template.label}&quot; template
          </DialogTitle>
          <DialogDescription className="text-zinc-400">
            Records this content only -- no real email currently renders it. Every change is recorded with your
            reason.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="subject" className={LABEL_CLASS}>
              Subject
            </Label>
            <Input
              id="subject"
              name="subject"
              defaultValue={template.subject ?? ""}
              placeholder="e.g. Welcome to WonderArc"
              className={FIELD_CLASS}
              aria-invalid={Boolean(fieldErrors.subject)}
            />
            {fieldErrors.subject && (
              <p role="alert" className="text-xs text-red-400">
                {fieldErrors.subject}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="body" className={LABEL_CLASS}>
              Body
            </Label>
            <Textarea
              id="body"
              name="body"
              defaultValue={template.body ?? ""}
              placeholder="Template copy..."
              className={FIELD_CLASS}
              rows={6}
              aria-invalid={Boolean(fieldErrors.body)}
            />
            {fieldErrors.body && (
              <p role="alert" className="text-xs text-red-400">
                {fieldErrors.body}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-1.5 border-t border-zinc-800 pt-3">
            <Label htmlFor="reason" className={LABEL_CLASS}>
              Reason (required)
            </Label>
            <Textarea
              id="reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Writing the first real copy for this template"
              className={FIELD_CLASS}
              rows={2}
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              className="text-zinc-300 hover:bg-zinc-800 hover:text-zinc-50"
              onClick={() => resetOnOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={pending || reason.trim().length === 0}>
              {pending ? "Saving…" : "Save changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
