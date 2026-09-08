import { getPublicEstimateView } from "@cofounderai/module-fsm/lib/estimates/queries";
import { markEstimateViewed } from "@cofounderai/module-fsm/lib/estimates/mutations";
import { PortalTokenError } from "@cofounderai/module-fsm/lib/portal-tokens/tokens";
import { PublicEstimateView } from "@cofounderai/module-fsm/components/estimates/public-estimate-view";
import { approveEstimatePublicAction, declineEstimatePublicAction } from "./actions";

export default async function PublicEstimatePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  let view;
  try {
    view = await getPublicEstimateView(token);
  } catch (err) {
    const message = err instanceof PortalTokenError ? err.message : "This link is invalid or has expired.";
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-2 p-10 text-center">
        <h1 className="text-lg font-semibold">Link unavailable</h1>
        <p className="text-sm text-muted-foreground">{message}</p>
      </div>
    );
  }

  // Best-effort "sent -> viewed" flip (PRD §1: "sent/viewed state is tracked by icons") --
  // never blocks rendering the estimate on a failed write.
  void markEstimateViewed(token).catch(() => {});

  return (
    <PublicEstimateView
      view={view}
      approveAction={approveEstimatePublicAction.bind(null, token)}
      declineAction={declineEstimatePublicAction.bind(null, token)}
    />
  );
}
