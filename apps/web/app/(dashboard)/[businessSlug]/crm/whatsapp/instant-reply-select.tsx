"use client";

import { useState, useTransition } from "react";
import { NativeSelect } from "@cofounderai/core/ui/native-select";
import { INSTANT_REPLY_MODE_LABELS as LABELS, OFFERED_INSTANT_REPLY_MODES } from "@cofounderai/module-crm/lib/instant-reply/acknowledgement";
import type { InstantReplyMode } from "@cofounderai/module-crm/lib/channel-accounts/types";

/** CRM-INSTANT-ACK-01: WhatsApp's instant-reply setting, saved on change. */
export function WhatsAppInstantReplySelect({
  value,
  disabled,
  action,
}: {
  value: InstantReplyMode;
  disabled?: boolean;
  action: (mode: InstantReplyMode) => Promise<void>;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex flex-col items-end gap-1">
      <NativeSelect
        aria-label="Instant reply"
        value={value === "instant_ack_then_human" ? value : "off"}
        disabled={disabled || pending}
        onChange={(e) => {
          const mode = e.target.value as InstantReplyMode;
          setError(null);
          startTransition(async () => {
            try {
              await action(mode);
            } catch (err) {
              setError(err instanceof Error ? err.message : "Could not save this setting.");
            }
          });
        }}
      >
        {OFFERED_INSTANT_REPLY_MODES.map((mode) => (
          <option key={mode} value={mode}>
            {LABELS[mode]}
          </option>
        ))}
      </NativeSelect>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
