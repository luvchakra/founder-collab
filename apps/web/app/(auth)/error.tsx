"use client";

import { ErrorNotice } from "@cofounderai/core/errors/error-notice";

export default function AuthError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <ErrorNotice error={error} reset={reset} />;
}
