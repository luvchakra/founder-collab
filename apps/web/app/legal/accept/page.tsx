import Link from "next/link";
import { redirect } from "next/navigation";
import { FileCheck } from "lucide-react";
import { createClient } from "@cofounderai/core/db/server";
import { LEGAL_DOCUMENT_LABELS, getPendingLegalAcceptances } from "@cofounderai/core/privacy/legal-acceptance";
import { formatDate } from "@cofounderai/core/lib/format";
import { WonderArkLogo } from "@cofounderai/core/shell/wonderark-logo";
import { signOut } from "@/app/(auth)/actions";
import { AcceptLegalButton } from "./accept-legal-button";

/**
 * PLATFORM-P1-09.4 (Policy Acceptance Tracking): where the dashboard sends a signed-in user
 * who hasn't accepted the active Terms of Service or Privacy Policy -- a first sign-in that
 * didn't go through the email signup form, or a new version that requires acceptance.
 */
export const dynamic = "force-dynamic";

const HREF = { terms: "/terms", privacy: "/privacy" } as const;

export default async function AcceptLegalPage() {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims) redirect("/login");

  const pending = await getPendingLegalAcceptances();
  if (pending.length === 0) redirect("/dashboard");
  const updated = pending.some((p) => p.ever_accepted);

  return (
    <main className="mx-auto flex min-h-svh w-full max-w-md flex-col items-center justify-center gap-5 px-4 py-10 text-center">
      <WonderArkLogo variant="primary" size="xs" adaptive priority className="mb-3" />
      <FileCheck className="size-12 text-primary" aria-hidden="true" />
      <h1 className="text-2xl font-semibold">{updated ? "We've updated our terms" : "Before you continue"}</h1>
      <ul className="flex w-full flex-col gap-3 text-left text-sm">
        {pending.map((p) => (
          <li key={p.version_id} className="rounded-xl border p-3">
            <Link href={HREF[p.document]} target="_blank" className="font-medium underline-offset-2 hover:underline">
              {LEGAL_DOCUMENT_LABELS[p.document]}
            </Link>
            <span className="text-muted-foreground">
              {" "}
              · version {p.version}, {formatDate(p.published_at)}
            </span>
            {p.ever_accepted ? <p className="mt-1 text-muted-foreground">{p.summary}</p> : null}
          </li>
        ))}
      </ul>
      <AcceptLegalButton versionIds={pending.map((p) => p.version_id)} />
      <form action={signOut}>
        <button type="submit" className="text-sm text-muted-foreground underline-offset-2 hover:underline">
          Sign out instead
        </button>
      </form>
    </main>
  );
}
