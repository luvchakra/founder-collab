import { getCustomerCenterView } from "@cofounderai/module-fsm/lib/customer-center/queries";
import { PortalTokenError } from "@cofounderai/module-fsm/lib/portal-tokens/tokens";
import { CustomerCenterView } from "@cofounderai/module-fsm/components/customer-center/customer-center-view";
import { approveEstimateCenterAction, declineEstimateCenterAction } from "./actions";

export default async function PublicCustomerCenterPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  let view;
  try {
    view = await getCustomerCenterView(token);
  } catch (err) {
    const message = err instanceof PortalTokenError ? err.message : "This link is invalid or has expired.";
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-2 p-10 text-center">
        <h1 className="text-lg font-semibold">Link unavailable</h1>
        <p className="text-sm text-muted-foreground">{message}</p>
      </div>
    );
  }

  return (
    <CustomerCenterView
      view={view}
      approveEstimateAction={approveEstimateCenterAction.bind(null, token)}
      declineEstimateAction={declineEstimateCenterAction.bind(null, token)}
    />
  );
}
