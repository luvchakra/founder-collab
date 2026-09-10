import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, Building2, CreditCard, KeyRound, Paintbrush, Receipt, ShieldCheck, Sparkles, Users } from "lucide-react";
import { getCurrentAccount, listBusinesses } from "@cofounderai/module-discovery/lib/tenancy/queries";
import { listLicensedModuleKeysByBusiness } from "@cofounderai/core/licensing/queries";
import { BusinessStatusButton } from "@cofounderai/module-discovery/components/tenancy/business-status-button";
import { disableBusinessAction, enableBusinessAction } from "./actions";

type SettingsLink = { label: string; href: string; description: string; icon: React.ComponentType<{ className?: string }> };

const ACCOUNT_LINKS: SettingsLink[] = [
  { label: "Licenses", href: "/dashboard/settings/licenses", description: "Activate, cancel, or reactivate a module for any business.", icon: ShieldCheck },
  { label: "Billing", href: "/dashboard/settings/billing", description: "Plan, AI provider, and credits.", icon: CreditCard },
  { label: "Usage", href: "/dashboard/settings/usage", description: "AI runs and spend across every workspace.", icon: Sparkles },
  { label: "Profile", href: "/dashboard/settings/profile", description: "Your own account details.", icon: Users },
  { label: "Appearance", href: "/dashboard/settings/appearance", description: "Light/dark theme.", icon: Paintbrush },
];

/**
 * The module-picker's "Admin" shortcut now lands here instead of going straight to
 * Licenses -- a real hub for every core admin config, not just one of them. Account-
 * level settings (above) apply regardless of business; the per-business section below
 * links out to configs that only make sense scoped to one business. API Keys now lives
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
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 p-8">
      <div>
        <h1 className="text-xl font-semibold">Admin &amp; settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Every core account and business configuration, in one place.
        </p>
      </div>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-medium text-muted-foreground">Account</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {ACCOUNT_LINKS.map(({ label, href, description, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className="flex items-start gap-3 rounded-md border p-4 transition-colors hover:border-primary hover:bg-accent/40"
            >
              <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <div className="min-w-0">
                <p className="font-medium">{label}</p>
                <p className="text-sm text-muted-foreground">{description}</p>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {businesses.length > 0 ? (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-medium text-muted-foreground">Business</h2>
          <div className="flex flex-col divide-y rounded-md border">
            {businesses.map((business) => {
              const modules = new Set(licensedModulesByBusiness[business.id] ?? []);
              const isDisabled = business.disabled_at !== null;
              return (
                <div key={business.id} className="flex flex-col gap-2 p-4">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Building2 className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                      <Link href={`/dashboard/businesses/${business.id}`} className="font-medium hover:underline">
                        {business.name}
                      </Link>
                      {isDisabled ? (
                        <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                          Disabled
                        </span>
                      ) : null}
                    </div>
                    <BusinessStatusButton
                      businessName={business.name}
                      disabled={isDisabled}
                      disableAction={disableBusinessAction.bind(null, business.id)}
                      enableAction={enableBusinessAction.bind(null, business.id)}
                    />
                  </div>
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
                      className="flex items-center gap-1 text-xs font-medium text-primary hover:underline"
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
