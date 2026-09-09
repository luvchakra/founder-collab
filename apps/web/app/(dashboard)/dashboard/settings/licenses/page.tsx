import { redirect } from "next/navigation";
import { getCurrentAccount, listBusinesses } from "@cofounderai/module-discovery/lib/tenancy/queries";
import { listLicensesForBusiness } from "@cofounderai/core/licensing/queries";
import type { License, LicenseStatus } from "@cofounderai/core/licensing/types";
import { moduleRegistry } from "@cofounderai/module-registry";
import { ModuleIcon } from "@cofounderai/core/shell/module-icon";
import { Badge } from "@cofounderai/core/ui/badge";
import { SubmitButton } from "@cofounderai/core/ui/submit-button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@cofounderai/core/ui/alert-dialog";
import { Button } from "@cofounderai/core/ui/button";
import { activateModuleAction, deactivateModuleAction } from "./actions";

function graceDaysLeft(graceEndsAt: string | null): number {
  if (!graceEndsAt) return 0;
  const ms = new Date(graceEndsAt).getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / (1000 * 60 * 60 * 24)));
}

function StatusBadge({ status, graceEndsAt }: { status: LicenseStatus | null; graceEndsAt: string | null }) {
  if (status === "active") return <Badge>Active</Badge>;
  if (status === "grace") {
    return <Badge variant="destructive">Grace period · {graceDaysLeft(graceEndsAt)}d left</Badge>;
  }
  if (status === "expired") return <Badge variant="secondary">Expired</Badge>;
  if (status === "cancelled") return <Badge variant="secondary">Cancelled</Badge>;
  return <Badge variant="outline">Not licensed</Badge>;
}

export default async function LicensesSettingsPage() {
  const account = await getCurrentAccount();
  if (!account) redirect("/login");

  const businesses = await listBusinesses(account.id);
  const licensesByBusiness = await Promise.all(
    businesses.map((business) => listLicensesForBusiness(business.id)),
  );

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 p-8">
      <div>
        <h1 className="text-xl font-semibold">Licenses</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage which modules are active for each of your businesses. Cancelling a
          module keeps your data for 30 days (read-only) before it fully expires --
          reactivating any time before then restores everything.
        </p>
      </div>

      {businesses.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Create a business first to manage its module licenses.
        </p>
      ) : (
        businesses.map((business, i) => {
          const licenses = licensesByBusiness[i] ?? [];
          const licenseByModule = new Map<string, License>(licenses.map((l) => [l.module_key, l]));

          return (
            <section key={business.id} className="flex flex-col gap-3">
              <h2 className="font-medium">{business.name}</h2>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {moduleRegistry.map((module) => {
                  const license = licenseByModule.get(module.key) ?? null;
                  const isActiveOrGrace = license?.status === "active" || license?.status === "grace";

                  return (
                    <div
                      key={module.key}
                      className="flex flex-col gap-3 rounded-md border p-4"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <ModuleIcon name={module.icon} className="size-5 text-muted-foreground" />
                          <span className="font-medium">{module.name}</span>
                        </div>
                        <StatusBadge status={license?.status ?? null} graceEndsAt={license?.grace_ends_at ?? null} />
                      </div>

                      {isActiveOrGrace ? (
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button type="button" variant="outline" size="sm">
                              Cancel
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Cancel {module.name} for {business.name}?</AlertDialogTitle>
                              <AlertDialogDescription>
                                This starts a 30-day read-only grace period, then full access is denied.
                                Your data is retained the whole time -- reactivating any time restores
                                everything exactly as it was.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Keep it active</AlertDialogCancel>
                              <form action={deactivateModuleAction.bind(null, business.id, module.key)}>
                                <AlertDialogAction asChild>
                                  <SubmitButton variant="destructive" size="sm" pendingText="Cancelling...">
                                    Cancel license
                                  </SubmitButton>
                                </AlertDialogAction>
                              </form>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      ) : (
                        <form action={activateModuleAction.bind(null, business.id, module.key)}>
                          <SubmitButton size="sm" pendingText="Activating...">
                            {license ? "Reactivate" : "Activate"}
                          </SubmitButton>
                        </form>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })
      )}
    </main>
  );
}
