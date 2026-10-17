"use client";

import { useEffect, useState, useTransition } from "react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@cofounderai/core/ui/collapsible";
import { RadioGroup, RadioGroupItem } from "@cofounderai/core/ui/radio-group";
import { Label } from "@cofounderai/core/ui/label";
import { AI_APPROVAL_MODE_LABEL, AI_APPROVAL_MODES, isAiApprovalMode, type AiApprovalMode } from "../../lib/ai-approval/types";

/**
 * DISC-AI-APPROVAL-01: the business's "AI approvals" setting, folded like the page's other
 * rarely changed settings. Opens by itself when reached through a "Change in settings"
 * link (`#ai-approvals`). Choosing an option saves it; the saved value is what the server
 * reads. Members without `business.settings.manage` see the current mode, disabled.
 */
export function AiApprovalModeSetting({
  mode,
  canManage,
  action,
}: {
  mode: AiApprovalMode;
  canManage: boolean;
  action: (mode: AiApprovalMode) => Promise<{ error: string } | { success: true }>;
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState<AiApprovalMode>(mode);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (window.location.hash === "#ai-approvals") setOpen(true);
  }, []);

  function choose(next: string) {
    if (!isAiApprovalMode(next) || next === value) return;
    const previous = value;
    setValue(next);
    setError(null);
    startTransition(async () => {
      const result = await action(next);
      if ("error" in result) {
        setValue(previous);
        setError(result.error);
      }
    });
  }

  return (
    <Collapsible open={open} onOpenChange={setOpen} id="ai-approvals" className="scroll-mt-20">
      <CollapsibleTrigger className="text-sm text-muted-foreground hover:text-foreground">AI approvals</CollapsibleTrigger>
      <CollapsibleContent className="flex flex-col gap-2 pt-2">
        <RadioGroup value={value} onValueChange={choose} disabled={!canManage || pending} aria-label="AI approvals">
          {AI_APPROVAL_MODES.map((option) => (
            <div key={option} className="flex items-center gap-2">
              <RadioGroupItem value={option} id={`ai-approval-${option}`} />
              <Label htmlFor={`ai-approval-${option}`} className="text-sm font-normal">
                {AI_APPROVAL_MODE_LABEL[option]}
              </Label>
            </div>
          ))}
        </RadioGroup>
        <p className="text-xs text-muted-foreground">
          {canManage
            ? "Applies to Auto-Populate and Run AI Discovery. Neither ever sends anything."
            : "You don't have permission to change this."}
        </p>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
      </CollapsibleContent>
    </Collapsible>
  );
}
