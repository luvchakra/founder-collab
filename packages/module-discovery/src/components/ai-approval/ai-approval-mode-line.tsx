import Link from "next/link";
import { AI_APPROVAL_MODE_STATUS, type AiApprovalMode } from "../../lib/ai-approval/types";

/** DISC-AI-APPROVAL-01: the one line shown where Discovery's AI flows start -- the
 * business's current approval mode and where to change it. */
export function AiApprovalModeLine({ mode, settingsHref }: { mode: AiApprovalMode; settingsHref: string }) {
  return (
    <p className="text-xs text-muted-foreground">
      {AI_APPROVAL_MODE_STATUS[mode]} ·{" "}
      <Link href={settingsHref} className="font-medium text-primary hover:underline">
        Change in settings
      </Link>
    </p>
  );
}
