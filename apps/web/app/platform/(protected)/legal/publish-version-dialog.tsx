"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { Button } from "@cofounderai/core/ui/button";
import { Checkbox } from "@cofounderai/core/ui/checkbox";
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
import { NativeSelect } from "@cofounderai/core/ui/native-select";
import { Textarea } from "@cofounderai/core/ui/textarea";
import { publishLegalVersionAction } from "./actions";

const DIALOG_CLASS = "border-zinc-800 bg-zinc-900 text-zinc-50";
const FIELD_CLASS = "border-zinc-700 bg-zinc-950/60 text-zinc-50 placeholder:text-zinc-500";
const LABEL_CLASS = "text-zinc-300";

/** PLATFORM-P1-09.1: publish the text this deployment serves as a new version. */
export function PublishVersionDialog({ defaultDocument }: { defaultDocument: "terms" | "privacy" }) {
  const [open, setOpen] = useState(false);
  const [document, setDocument] = useState<"terms" | "privacy">(defaultDocument);
  const [version, setVersion] = useState("");
  const [summary, setSummary] = useState("");
  const [requiresAcceptance, setRequiresAcceptance] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onOpenChange(next: boolean) {
    setOpen(next);
    setDocument(defaultDocument);
    setVersion(new Date().toISOString().slice(0, 10));
    setSummary("");
    setRequiresAcceptance(true);
    setError(null);
  }

  function publish() {
    setError(null);
    startTransition(async () => {
      const result = await publishLegalVersionAction({ document, version, summary, requiresAcceptance });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast.success(requiresAcceptance ? "Published. Users will be asked to accept it." : "Published.");
      onOpenChange(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="size-4" aria-hidden="true" />
          Publish version
        </Button>
      </DialogTrigger>
      <DialogContent className={`${DIALOG_CLASS} max-w-md`}>
        <DialogHeader>
          <DialogTitle>Publish a version</DialogTitle>
          <DialogDescription className="text-zinc-400">Records the text this deployment serves as the active version. Can&apos;t be edited afterwards.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="legal-document" className={LABEL_CLASS}>
                Document
              </Label>
              <NativeSelect id="legal-document" value={document} onChange={(e) => setDocument(e.target.value as "terms" | "privacy")} className={FIELD_CLASS}>
                <option value="terms">Terms of Service</option>
                <option value="privacy">Privacy Policy</option>
              </NativeSelect>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="legal-version" className={LABEL_CLASS}>
                Version
              </Label>
              <Input id="legal-version" value={version} onChange={(e) => setVersion(e.target.value)} className={FIELD_CLASS} />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="legal-summary" className={LABEL_CLASS}>
              What changed (required)
            </Label>
            <Textarea id="legal-summary" value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="e.g. Clarified refunds" className={FIELD_CLASS} rows={2} />
          </div>
          <label className="flex items-start gap-2 text-sm text-zinc-200">
            <Checkbox checked={requiresAcceptance} onCheckedChange={(c) => setRequiresAcceptance(c === true)} className="mt-0.5" />
            <span>
              Users must accept it
              <span className="block text-xs text-zinc-400">Everyone is asked on their next visit. Leave off for a typo fix.</span>
            </span>
          </label>
          {error ? (
            <p role="alert" className="text-sm text-red-400">
              {error}
            </p>
          ) : null}
        </div>
        <DialogFooter>
          <Button type="button" variant="ghost" className="text-zinc-300 hover:bg-zinc-800 hover:text-zinc-50" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={publish} disabled={pending || summary.trim().length === 0 || version.trim().length === 0}>
            {pending ? "Publishing…" : "Publish"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
