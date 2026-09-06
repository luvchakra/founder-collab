import Link from "next/link";

/** "What you can do" list for an AI/BYOK provider failure -- shared between the
 * full-page AiErrorNotice boundary and AiActionForm's inline error. */
export function AiErrorOptions() {
  return (
    <div className="max-w-md rounded-md border bg-muted/40 p-4 text-left text-sm">
      <p className="font-medium">What you can do:</p>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
        <li>
          Check your connection under{" "}
          <Link href="/dashboard/settings/ai-provider" className="underline">
            AI Provider settings
          </Link>{" "}
          -- replace the key if it&apos;s expired or revoked.
        </li>
        <li>
          If your provider account hit a rate limit or quota cap, check its billing plan,
          then retry once that&apos;s resolved.
        </li>
        <li>
          You can connect a different provider (OpenAI, Anthropic, or Google) at any time
          from the same settings page.
        </li>
      </ul>
    </div>
  );
}
