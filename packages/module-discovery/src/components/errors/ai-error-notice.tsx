import { Button } from "@cofounderai/core/ui/button";
import { isAiProviderFailure } from "@cofounderai/core/ai-providers/is-provider-failure";
import { AiErrorOptions } from "./ai-error-options";

/**
 * Shared "Something went wrong" error boundary body -- the last-resort fallback for an
 * uncaught error that reaches a route's error.tsx (e.g. a tenancy lookup failure, not
 * one of the AI actions AiActionForm already catches inline). Next.js redacts a thrown
 * error's real message in production, so error.message here is usually just the generic
 * digest text; the AI options list only shows when the message happens to match the
 * fixed phrases toAiProviderError produces, which is the case for any AiProviderError
 * that surfaces this way rather than through AiActionForm.
 */
export function AiErrorNotice({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-12 text-center">
      <h2 className="text-lg font-semibold">Something went wrong</h2>
      <p className="max-w-md text-sm text-muted-foreground">{error.message}</p>
      {isAiProviderFailure(error.message) ? <AiErrorOptions /> : null}
      <Button onClick={reset}>Try again</Button>
    </div>
  );
}
