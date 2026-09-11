"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus, Sparkles } from "lucide-react";
import { Button } from "@cofounderai/core/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@cofounderai/core/ui/dialog";
import { Input } from "@cofounderai/core/ui/input";
import { Label } from "@cofounderai/core/ui/label";
import { NativeSelect } from "@cofounderai/core/ui/native-select";
import { SubmitButton } from "@cofounderai/core/ui/submit-button";
import { Textarea } from "@cofounderai/core/ui/textarea";
import { toast } from "@cofounderai/core/ui/sonner";
import type { OfferingProfileSuggestion } from "../../lib/ai/schemas";
import { OFFERING_TYPE_LABEL, OFFERING_TYPE_VALUES } from "../../lib/offerings/types";
import type { Offering, OfferingType } from "../../lib/offerings/types";

type FormResult = { error: string } | { success: true };
type SuggestResult = { error: string } | { success: true; suggestion: OfferingProfileSuggestion };

/**
 * DISC-OFFER-P0-01.3's "Create/Edit UI" -- one dialog, two modes, rather than a
 * separate create form and edit form: both collect the same field set (name, website,
 * short description, and the Offering-specific fields DISC-OFFER-P0-01.1 added), and a
 * founder editing an offering later benefits from the exact same layout they created it
 * in. `detailedDescription`/`valueProposition`/`primaryProblem` are grouped under their
 * own "Commercial details" heading, separate from the always-visible basics -- keeping
 * the dialog from reading as one undifferentiated wall of inputs (the Global UI Design
 * Rule's own "improve information hierarchy... grouping").
 *
 * DISC-OFFER-P0-02.1's "Offering Setup Wizard" AI half lives here too, as a "Suggest
 * fields" step inside Edit rather than a separate multi-screen wizard: a founder types
 * one free-text description, clicks Suggest, and the type/category/target
 * market/problem/value-proposition fields below fill in as *editable* proposals (never
 * auto-saved -- "User must accept/edit suggestions before activation" holds because
 * this is the exact same form Save always requires a click on). Only offered in Edit
 * (`suggestAction` is undefined in Create): the AI call is workspace-scoped for usage
 * accounting, and a not-yet-created offering has no workspace yet -- "You can complete
 * setup without AI" already holds in Create, which is plain manual fields throughout.
 */
export function OfferingFormDialog({
  mode,
  offering,
  action,
  suggestAction,
}: {
  mode: "create" | "edit";
  offering?: Offering;
  action: (formData: FormData) => Promise<FormResult>;
  suggestAction?: (description: string) => Promise<SuggestResult>;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [suggesting, startSuggestTransition] = useTransition();

  const [quickDescription, setQuickDescription] = useState("");
  const [offeringType, setOfferingType] = useState<OfferingType | "">(offering?.offering_type ?? "");
  const [category, setCategory] = useState(offering?.category ?? "");
  const [targetMarket, setTargetMarket] = useState(offering?.target_market ?? "");
  const [primaryProblem, setPrimaryProblem] = useState(offering?.primary_problem ?? "");
  const [valueProposition, setValueProposition] = useState(offering?.value_proposition ?? "");

  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      const result = await action(formData);
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      setOpen(false);
      router.refresh();
      toast.success(mode === "create" ? "Offering created." : "Offering updated.");
    });
  }

  function handleSuggest() {
    if (!suggestAction) return;
    startSuggestTransition(async () => {
      const result = await suggestAction(quickDescription);
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      const { suggestion } = result;
      if (suggestion.offeringType) setOfferingType(suggestion.offeringType as OfferingType);
      if (suggestion.category) setCategory(suggestion.category);
      if (suggestion.targetMarket) setTargetMarket(suggestion.targetMarket);
      if (suggestion.primaryProblem) setPrimaryProblem(suggestion.primaryProblem);
      if (suggestion.valueProposition) setValueProposition(suggestion.valueProposition);
      toast.success("Suggested fields below -- review and edit before saving.");
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {mode === "create" ? (
          <Button size="sm">
            <Plus className="size-4" aria-hidden="true" />
            New offering
          </Button>
        ) : (
          <button
            type="button"
            aria-label={`Edit ${offering?.name}`}
            className="rounded-sm p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <Pencil className="size-3.5" aria-hidden="true" />
          </button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{mode === "create" ? "New offering" : `Edit ${offering?.name}`}</DialogTitle>
        </DialogHeader>
        <form action={handleSubmit} className="flex flex-col gap-4">
          {suggestAction ? (
            <div className="flex flex-col gap-2 rounded-lg border border-dashed border-border p-3">
              <Label htmlFor="quickDescription">Describe it in your own words</Label>
              <Textarea
                id="quickDescription"
                rows={2}
                value={quickDescription}
                onChange={(e) => setQuickDescription(e.target.value)}
                placeholder="e.g. We provide managed IAM services to mid-size financial companies."
              />
              <Button type="button" variant="outline" size="sm" className="self-start" disabled={suggesting || !quickDescription.trim()} onClick={handleSuggest}>
                <Sparkles className="size-3.5" aria-hidden="true" />
                {suggesting ? "Suggesting..." : "Suggest fields with AI"}
              </Button>
            </div>
          ) : null}

          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="name">Name</Label>
              <Input id="name" name="name" defaultValue={offering?.name} required />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="offeringType">Type</Label>
                <NativeSelect id="offeringType" name="offeringType" value={offeringType} onChange={(e) => setOfferingType(e.target.value as OfferingType)}>
                  <option value="" disabled>
                    Select a type
                  </option>
                  {OFFERING_TYPE_VALUES.map((type) => (
                    <option key={type} value={type}>
                      {OFFERING_TYPE_LABEL[type]}
                    </option>
                  ))}
                </NativeSelect>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="category">Category</Label>
                <Input id="category" name="category" value={category} onChange={(e) => setCategory(e.target.value)} placeholder="e.g. Managed security services" />
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="website">Website</Label>
              <Input id="website" name="website" defaultValue={offering?.website ?? ""} placeholder="https://" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="description">Short description</Label>
              <Textarea id="description" name="description" rows={2} defaultValue={offering?.description ?? ""} />
            </div>
          </div>

          <div className="flex flex-col gap-3 border-t border-border pt-4">
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Commercial details</p>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="targetMarket">Target market</Label>
              <Input
                id="targetMarket"
                name="targetMarket"
                value={targetMarket}
                onChange={(e) => setTargetMarket(e.target.value)}
                placeholder="e.g. Mid-size financial services companies"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="primaryProblem">Primary problem it solves</Label>
              <Textarea id="primaryProblem" name="primaryProblem" rows={2} value={primaryProblem} onChange={(e) => setPrimaryProblem(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="valueProposition">Value proposition</Label>
              <Textarea id="valueProposition" name="valueProposition" rows={2} value={valueProposition} onChange={(e) => setValueProposition(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="detailedDescription">Detailed description</Label>
              <Textarea id="detailedDescription" name="detailedDescription" rows={4} defaultValue={offering?.detailed_description ?? ""} />
            </div>
          </div>

          <DialogFooter>
            <SubmitButton disabled={pending} pendingText={mode === "create" ? "Creating..." : "Saving..."}>
              {mode === "create" ? "Create offering" : "Save changes"}
            </SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
