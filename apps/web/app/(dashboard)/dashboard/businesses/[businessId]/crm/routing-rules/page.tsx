import { notFound } from "next/navigation";
import { getBusiness } from "@cofounderai/module-crm/lib/tenancy/queries";
import { listRoutingRules, listEmployeeOptions } from "@cofounderai/module-crm/lib/routing-rules/queries";
import { listChannels } from "@cofounderai/module-crm/lib/channels/queries";
import { getEscalationConfig } from "@cofounderai/module-crm/lib/escalation/queries";
import { RoutingRulesView } from "@cofounderai/module-crm/components/routing-rules/routing-rules-view";
import { createRoutingRuleAction, setEscalationManagerAction, setRoutingRuleActiveAction } from "./actions";
import { EscalationSettings } from "./escalation-settings";

export default async function CrmRoutingRulesPage({ params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params;
  const business = await getBusiness(businessId);
  if (!business) notFound();

  const [rules, channels, employees, escalationConfig] = await Promise.all([
    listRoutingRules(businessId),
    listChannels(businessId),
    listEmployeeOptions(businessId),
    getEscalationConfig(businessId),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">Routing rules</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          How {business.name} wants incoming tickets assigned. Structure only for now --
          nothing applies these rules to an incoming message yet.
        </p>
      </div>

      <RoutingRulesView
        rules={rules}
        channels={channels}
        employees={employees}
        createAction={createRoutingRuleAction.bind(null, businessId)}
        setActiveAction={setRoutingRuleActiveAction.bind(null, businessId)}
      />

      <EscalationSettings config={escalationConfig} employees={employees} action={setEscalationManagerAction.bind(null, businessId)} />
    </div>
  );
}
