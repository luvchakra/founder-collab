import Link from "next/link";
import { Sparkles } from "lucide-react";

/** FIN-3: the dashboard's own pointer to the activation checklist -- shown only until the
 * business has activated once (`activatedAt !== null`), so it never nags a business that's
 * already through it. `/finance/activate` is deliberately not in the sidebar nav (like
 * Discovery's own onboarding wizard at `/onboarding`): a one-time setup flow doesn't
 * belong in the permanent rail, and this banner is how it stays reachable. */
export function ActivationBanner({ basePath }: { basePath: string }) {
  return (
    <Link
      href={`${basePath}/activate`}
      className="flex items-center gap-3 rounded-2xl border border-primary/30 bg-primary/5 p-4 text-sm transition-colors hover:bg-primary/10"
    >
      <Sparkles className="size-4 shrink-0 text-primary" aria-hidden="true" />
      <span className="flex-1">
        <span className="font-medium text-foreground">Finish setting up Finance</span>
        <span className="text-muted-foreground"> -- chart of accounts, GST profile, bank accounts, and a first backfill.</span>
      </span>
      <span className="shrink-0 text-primary">Continue &rarr;</span>
    </Link>
  );
}
