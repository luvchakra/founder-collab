"use client";

import { AiErrorNotice } from "@cofounderai/module-discovery/components/errors/ai-error-notice";

export default function DiscoverError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <AiErrorNotice error={error} reset={reset} />;
}
