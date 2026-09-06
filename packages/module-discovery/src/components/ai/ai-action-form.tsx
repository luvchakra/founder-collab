"use client";

import { useActionState } from "react";
import type { ComponentProps, ReactNode } from "react";
import { SubmitButton } from "@cofounderai/core/ui/submit-button";
import { isAiProviderFailure } from "@cofounderai/core/ai-providers/is-provider-failure";
import { AiErrorOptions } from "../errors/ai-error-options";
import type { AiActionState } from "@cofounderai/core/actions/ai-action-state";

/**
 * Wraps a single-button form around an AI-invoking action so a failure shows the real
 * message instead of Next.js's production-redacted generic error. The action must
 * return AiActionState (see lib/actions/ai-action-state.ts's runAiAction) rather than
 * throwing -- a thrown error would still hit the route's error.tsx boundary and lose its
 * message in production, defeating the point of this component.
 */
export function AiActionForm({
  action,
  buttonLabel,
  pendingText,
  children,
  formClassName,
  wrapperClassName,
  buttonProps,
}: {
  action: (prevState: AiActionState, formData: FormData) => Promise<AiActionState>;
  buttonLabel: ReactNode;
  pendingText: string;
  /** Extra form fields (a <select>, a hidden input, etc.) rendered before the button. */
  children?: ReactNode;
  formClassName?: string;
  wrapperClassName?: string;
  buttonProps?: Partial<ComponentProps<typeof SubmitButton>>;
}) {
  const [state, formAction] = useActionState<AiActionState, FormData>(action, null);

  return (
    <div className={wrapperClassName ?? "flex flex-col items-start gap-2"}>
      <form action={formAction} className={formClassName}>
        {children}
        <SubmitButton size="sm" pendingText={pendingText} {...buttonProps}>
          {buttonLabel}
        </SubmitButton>
      </form>
      {state?.error ? (
        <div className="flex max-w-md flex-col gap-2">
          <p role="alert" className="text-sm text-destructive">
            {state.error}
          </p>
          {isAiProviderFailure(state.error) ? <AiErrorOptions /> : null}
        </div>
      ) : null}
    </div>
  );
}
