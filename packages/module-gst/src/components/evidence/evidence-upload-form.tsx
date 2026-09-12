"use client";

import { useActionState, useEffect, useRef } from "react";
import { UploadCloud } from "lucide-react";
import { Label } from "@cofounderai/core/ui/label";
import { NativeSelect } from "@cofounderai/core/ui/native-select";
import { Textarea } from "@cofounderai/core/ui/textarea";
import { SubmitButton } from "@cofounderai/core/ui/submit-button";
import { EVIDENCE_TYPES, type EvidenceType } from "../../lib/evidence/types";

export type RecordEvidenceActionState = { error: string } | { success: true } | null;

const EVIDENCE_TYPE_LABEL: Record<EvidenceType, string> = {
  return_acknowledgment: "Return acknowledgment (ARN)",
  payment_challan: "Payment challan",
  government_notice: "Government notice",
  audit_response: "Audit / inquiry response",
  other: "Other",
};

/**
 * COMPLY-P0-10.1/COMPLY-P0-11 (Evidence Repository UI). An inline form, not a modal --
 * this is a simple, standalone "add a file" action with no existing row to edit, so the
 * modal machinery `RegistrationModal` needs for a create/edit dialog would be
 * unnecessary weight here (design rules: "every visual element should have a purpose").
 */
export function EvidenceUploadForm({ action }: { action: (prevState: RecordEvidenceActionState, formData: FormData) => Promise<RecordEvidenceActionState> }) {
  const [state, formAction] = useActionState<RecordEvidenceActionState, FormData>(action, null);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state && "success" in state) formRef.current?.reset();
  }, [state]);

  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="evidence-file">File</Label>
          <input
            id="evidence-file"
            name="file"
            type="file"
            required
            className="border-input flex h-9 w-full rounded-md border bg-transparent px-3 py-1 text-sm shadow-xs outline-none file:mr-3 file:rounded-sm file:border-0 file:bg-secondary file:px-2 file:py-1 file:text-xs focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="evidence-type">Evidence type</Label>
          <NativeSelect id="evidence-type" name="evidence_type" required defaultValue="">
            <option value="" disabled>
              Select a type
            </option>
            {EVIDENCE_TYPES.map((type) => (
              <option key={type} value={type}>
                {EVIDENCE_TYPE_LABEL[type]}
              </option>
            ))}
          </NativeSelect>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="evidence-description">Description (optional)</Label>
        <Textarea id="evidence-description" name="description" rows={2} placeholder="e.g. GSTR-3B ARN for August 2026" />
      </div>

      {state && "error" in state ? <p className="text-sm text-destructive">{state.error}</p> : null}

      <div className="flex justify-end">
        <SubmitButton size="sm">
          <UploadCloud className="size-4" aria-hidden="true" />
          Upload evidence
        </SubmitButton>
      </div>
    </form>
  );
}
