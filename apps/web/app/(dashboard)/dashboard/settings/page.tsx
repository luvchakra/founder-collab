import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, Building2, KeyRound, Receipt, Users } from "lucide-react";
import { getCurrentAccount, listBusinesses } from "@cofounderai/module-discovery/lib/tenancy/queries";
import { listLicensedModuleKeysByBusiness } from "@cofounderai/core/licensing/queries";
import { BusinessStatusButton } from "@cofounderai/module-discovery/components/tenancy/business-status-button";
import { disableBusinessAction, enableBusinessAction } from "./actions";

/**
 * The module-picker's "Admin" shortcut lands here -- business/module configuration only.
 * Account-wide settings (Licenses/Billing/Usage/Profile/Appearance) used to also be
 * listed here under an "Account" section, but that duplicated the avatar menu's own
 * direct links to each of those (sidebar-account-menu.tsx) and Licenses's own quick-link
 * on the Executive Dashboard -- module-level Admin now only surfaces the per-business
 * configs below, which is the one thing this entry point actually adds. API Keys lives
 * at its own business-wide `admin/api-keys` route (moved out from under `/inventory/`
 * this pass -- `core.api_keys` was never actually inventory-specific, see that page's
 * own doc comment), so it's linked unconditionally rather than behind an inventory-
 * license check. Team & Permissions is still a real follow-up: it remains nested under
 * `/inventory/team` for now (out of scope for this pass), so it stays gated on the
 * inventory license until it gets the same treatment.
 */
export default async function SettingsHubPage() {
  const account = await getCurrentAccount();
  if (!account) redirect("/login");

  const businesses = await listBusinesses(account.id);
  const licensedModulesByBusiness = await listLicensedModuleKeysByBusiness(businesses.map((b) => b.id));

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-8 p-4 sm:p-8">
      <div>
        <h1 className="text-xl font-semibold">Global Configurations</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Every business configuration, in one place.
        </p>
      </div>

      {businesses.length > 0 ? (
        <section className="flex flex-col gap-2">
          <div className="flex flex-col divide-y rounded-md border">
            {businesses.map((business) => {
              const modules = new Set(licensedModulesByBusiness[business.id] ?? []);
              const isDisabled = business.disabled_at !== null;
              return (
                <div key={business.id} className="flex flex-col gap-3 p-4 sm:p-5">
                  {/* Header: identity (left) vs. the one destructive/state-changing
                      action (right) -- kept apart from the navigational chips below so
                      "disable this business" never reads as just another quick link. */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-start gap-2">
                      <Building2 className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                      <div className="flex min-w-0 flex-wrap items-center gap-2">
                        <Link href={`/dashboard/businesses/${business.id}`} className="font-medium hover:underline">
                          {business.name}
                        </Link>
                        {isDisabled ? (
                          <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                            Disabled
                          </span>
                        ) : null}
                      </div>
                    </div>
                    <BusinessStatusButton
                      businessName={business.name}
                      disabled={isDisabled}
                      disableAction={disableBusinessAction.bind(null, business.id)}
                      enableAction={enableBusinessAction.bind(null, business.id)}
                    />
                  </div>
                  {/* One row of equally-weighted chips -- the per-module quick links
                      first, "Business details" last as the always-present catch-all,
                      styled the same as the others (just in the primary color) instead
                      of a differently-sized bare text link stuck on its own. */}
                  <div className="flex flex-wrap gap-2 pl-6">
                    {modules.has("inventory") ? (
                      <Link
                        href={`/dashboard/businesses/${business.id}/inventory/team`}
                        className="flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs font-medium text-muted-foreground hover:border-primary hover:text-foreground"
                      >
                        <Users className="size-3" aria-hidden="true" />
                        Team &amp; permissions
                      </Link>
                    ) : null}
                    <Link
                      href={`/dashboard/businesses/${business.id}/admin/api-keys`}
                      className="flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs font-medium text-muted-foreground hover:border-primary hover:text-foreground"
                    >
                      <KeyRound className="size-3" aria-hidden="true" />
                      API keys
                    </Link>
                    {modules.has("gst") ? (
                      <Link
                        href={`/dashboard/businesses/${business.id}/gst/profile`}
                        className="flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs font-medium text-muted-foreground hover:border-primary hover:text-foreground"
                      >
                        <Receipt className="size-3" aria-hidden="true" />
                        GST profile
                      </Link>
                    ) : null}
                    <Link
                      href={`/dashboard/businesses/${business.id}`}
                      className="flex items-center gap-1 rounded-md border border-primary/30 px-2.5 py-1 text-xs font-medium text-primary hover:bg-primary/5"
                    >
                      Business details
                      <ArrowRight className="size-3" aria-hidden="true" />
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ) : null}
    </main>
  );
}
