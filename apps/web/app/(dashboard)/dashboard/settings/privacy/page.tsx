import { redirect } from "next/navigation";
import { createClient } from "@cofounderai/core/db/server";
import { getCurrentAccount, listBusinesses } from "@cofounderai/module-discovery/lib/tenancy/queries";
import { getCurrentConsents } from "@cofounderai/core/privacy/consent";
import { DSR_TYPE_LABELS, PRIVACY_NOTICE_VERSION } from "@cofounderai/core/privacy/notice";
import { listBusinessRequests, listOwnRequests } from "@cofounderai/core/privacy/requests";
import { hasPermission } from "@cofounderai/core/finance/controls";
import { Badge } from "@cofounderai/core/ui/badge";
import { SubmitButton } from "@cofounderai/core/ui/submit-button";
import { BusinessRequestForm, DeleteAccountForm, OwnRequestForm } from "@/components/settings/privacy-forms";
import {
  deleteAccountAction,
  eraseSubjectAction,
  fileOwnRequestAction,
  logBusinessRequestAction,
  setMarketingConsentAction,
  setRequestStatusAction,
} from "./actions";

function dateOnly(iso: string) {
  return new Date(iso).toLocaleDateString();
}

/**
 * Self-service data rights (GDPR Arts. 7, 15-21; DPDP ss. 6, 11-14): consents, download,
 * requests, account deletion -- plus, for members with privacy.manage, the register of
 * requests the business receives from its own customers and prospects.
 */
export default async function PrivacySettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const account = await getCurrentAccount();

  const [consents, ownRequests, businesses] = await Promise.all([
    getCurrentConsents(user.id),
    listOwnRequests(user.id),
    account ? listBusinesses(account.id) : Promise.resolve([]),
  ]);
  const managed = (
    await Promise.all(
      businesses.map(async (b) => ((await hasPermission(b.id, "privacy.manage")) ? b : null)),
    )
  ).filter((b): b is NonNullable<typeof b> => b !== null);
  const businessRequests = await Promise.all(managed.map((b) => listBusinessRequests(b.id)));
  const marketing = consents.marketing_communications?.granted ?? false;

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 p-8">
      <div>
        <h1 className="text-xl font-semibold">Privacy &amp; data</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Control how your personal data is used, download it, or delete your account. See the{" "}
          <a href="/privacy" className="text-primary underline">privacy notice</a> for details.
        </p>
      </div>

      <section className="flex flex-col gap-3 rounded-md border p-4">
        <h2 className="font-medium">Consents</h2>
        <p className="text-sm text-muted-foreground">
          Privacy notice: accepted version {consents.terms_privacy?.notice_version ?? "—"}
          {consents.terms_privacy ? ` on ${dateOnly(consents.terms_privacy.created_at)}` : ""}
          {consents.terms_privacy?.notice_version !== PRIVACY_NOTICE_VERSION ? " (an update is pending)" : ""}.
        </p>
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm">Product updates by email</span>
          <form action={setMarketingConsentAction.bind(null, !marketing)}>
            <SubmitButton size="sm" variant="outline" pendingText="Saving...">
              {marketing ? "Withdraw consent" : "Opt in"}
            </SubmitButton>
          </form>
        </div>
      </section>

      <section className="flex flex-col gap-3 rounded-md border p-4">
        <h2 className="font-medium">Download your data</h2>
        <p className="text-sm text-muted-foreground">
          A machine-readable (JSON) copy of your account, memberships, consents, requests and the
          actions recorded against your name.
        </p>
        <a
          href="/dashboard/settings/privacy/export"
          className="self-start rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-accent"
        >
          Download JSON
        </a>
      </section>

      <section className="flex flex-col gap-3 rounded-md border p-4">
        <h2 className="font-medium">Make a request</h2>
        <p className="text-sm text-muted-foreground">
          You can correct your name and phone on the Profile page. For anything else -- restricting or
          objecting to processing, a grievance, or nominating someone to act for you -- send us a
          request. We respond within 30 days.
        </p>
        <OwnRequestForm action={fileOwnRequestAction} />
        {ownRequests.length > 0 ? (
          <ul className="flex flex-col gap-1 text-sm">
            {ownRequests.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-2">
                <span>
                  {DSR_TYPE_LABELS[r.request_type]} · {dateOnly(r.created_at)}
                  {r.response ? <span className="text-muted-foreground"> -- {r.response}</span> : null}
                </span>
                <Badge variant={r.status === "completed" ? "default" : "outline"}>{r.status}</Badge>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      {managed.map((business, i) => (
        <section key={business.id} className="flex flex-col gap-3 rounded-md border p-4">
          <h2 className="font-medium">Requests to {business.name} from its customers &amp; contacts</h2>
          <p className="text-sm text-muted-foreground">
            When someone asks your business to access, correct or erase their data, log it here so it&apos;s
            tracked against its 30-day deadline. Erasing removes their contacts, outreach and contact
            details across every module and stops all further email to them; invoices they appear on
            are kept, as tax law requires, with everything else stripped.
          </p>
          <BusinessRequestForm action={logBusinessRequestAction.bind(null, business.id)} />
          {(businessRequests[i] ?? []).length > 0 ? (
            <ul className="flex flex-col divide-y text-sm">
              {(businessRequests[i] ?? []).map((r) => {
                const open = r.status === "received" || r.status === "in_progress";
                const overdue = open && new Date(r.due_at) < new Date();
                return (
                  <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <span>
                      {DSR_TYPE_LABELS[r.request_type]} · {r.subject_email ?? "(address removed)"} · due{" "}
                      {dateOnly(r.due_at)}
                      {r.response ? <span className="block text-xs text-muted-foreground">{r.response}</span> : null}
                    </span>
                    <span className="flex items-center gap-2">
                      <Badge variant={overdue ? "destructive" : open ? "outline" : "default"}>
                        {overdue ? "overdue" : r.status}
                      </Badge>
                      {open && r.request_type === "erasure" && r.subject_email ? (
                        <form action={eraseSubjectAction.bind(null, business.id, r.id)}>
                          <SubmitButton size="sm" variant="destructive" pendingText="Erasing...">
                            Erase now
                          </SubmitButton>
                        </form>
                      ) : null}
                      {open ? (
                        <>
                          <form action={setRequestStatusAction.bind(null, r.id, "completed")}>
                            <SubmitButton size="sm" variant="outline" pendingText="...">
                              Mark done
                            </SubmitButton>
                          </form>
                          <form action={setRequestStatusAction.bind(null, r.id, "rejected")}>
                            <SubmitButton size="sm" variant="ghost" pendingText="...">
                              Reject
                            </SubmitButton>
                          </form>
                        </>
                      ) : null}
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : null}
        </section>
      ))}

      <section className="flex flex-col gap-3 rounded-md border border-destructive/40 p-4">
        <h2 className="font-medium text-destructive">Delete your account</h2>
        <p className="text-sm text-muted-foreground">
          Permanently deletes your login, profile, memberships and consents, and any account where you
          are the only member along with its businesses. Businesses with issued tax invoices are kept,
          with all access closed, for the 8 years GST law requires, then deleted. This can&apos;t be undone.
        </p>
        <DeleteAccountForm action={deleteAccountAction} email={user.email ?? ""} />
      </section>
    </main>
  );
}
