import { notFound } from "next/navigation";
import { hasPermission } from "@cofounderai/core/rbac/require-permission";
import { getBusiness } from "@cofounderai/module-fsm/lib/tenancy/queries";
import { listJobChargeTypes } from "@cofounderai/module-fsm/lib/job-charge-types/queries";
import { listFsmNumberSequences } from "@cofounderai/module-fsm/lib/numbering/queries";
import { listServiceTypes } from "@cofounderai/module-fsm/lib/service-types/queries";
import { getFsmSettings } from "@cofounderai/module-fsm/lib/settings/queries";
import { SettingsView } from "@cofounderai/module-fsm/components/settings/settings-view";
import {
  createJobChargeTypeAction,
  createServiceTypeAction,
  setJobChargeTypeActiveAction,
  setServiceTypeActiveAction,
  updateFsmSettingsAction,
  updateJobChargeTypeAction,
  updateServiceTypeAction,
} from "./actions";

export default async function FsmSettingsPage({ params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params;
  const business = await getBusiness(businessId);
  if (!business) notFound();

  const canManageSettings = await hasPermission(businessId, "settings.manage");
  if (!canManageSettings) {
    return (
      <div className="flex flex-col gap-2">
        <h1 className="text-xl font-semibold">Settings</h1>
        <p className="text-sm text-muted-foreground">You don&apos;t have permission to view FSM settings for {business.name}.</p>
      </div>
    );
  }

  const [serviceTypes, jobChargeTypes, settings, numberSequences] = await Promise.all([
    listServiceTypes(businessId),
    listJobChargeTypes(businessId),
    getFsmSettings(businessId),
    listFsmNumberSequences(businessId),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">{business.name}</p>
      </div>

      <SettingsView
        serviceTypes={serviceTypes}
        jobChargeTypes={jobChargeTypes}
        settings={settings}
        numberSequences={numberSequences}
        createServiceTypeAction={createServiceTypeAction.bind(null, businessId)}
        updateServiceTypeAction={updateServiceTypeAction.bind(null, businessId)}
        setServiceTypeActiveAction={setServiceTypeActiveAction.bind(null, businessId)}
        createJobChargeTypeAction={createJobChargeTypeAction.bind(null, businessId)}
        updateJobChargeTypeAction={updateJobChargeTypeAction.bind(null, businessId)}
        setJobChargeTypeActiveAction={setJobChargeTypeActiveAction.bind(null, businessId)}
        updateSettingsAction={updateFsmSettingsAction.bind(null, businessId)}
      />
    </div>
  );
}
