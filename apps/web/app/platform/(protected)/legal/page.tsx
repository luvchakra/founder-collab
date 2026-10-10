import { getLegalOverview, type LegalDocumentOverview } from "@cofounderai/core/admin/platform-legal";
import { LEGAL_DOCUMENT_LABELS } from "@cofounderai/core/privacy/legal-acceptance";
import { Badge } from "@cofounderai/core/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@cofounderai/core/ui/collapsible";
import { COOKIE_INVENTORY, consentBannerRequired } from "@/lib/cookie-inventory";
import { LEGAL_LAST_UPDATED } from "@/lib/legal";
import { legalContentHash } from "@/lib/legal-hash";
import { EmptyState, Panel, formatWhen } from "../billing/billing-ui";
import { PublishVersionDialog } from "./publish-version-dialog";

/**
 * PLATFORM-P1-09.1 (Terms & Privacy Version), PLATFORM-P1-09.2 (Cookie / Consent
 * Configuration) and PLATFORM-P1-09.4 (Policy Acceptance Tracking),
 * docs/plan/09-PLATFORM-ADMIN-PORTAL-BACKLOG.md §31. Each document's active version, whether
 * the text the app serves still matches it (by hash), and how many users have accepted it;
 * then what the app stores in browsers and whether that needs a consent banner.
 */

const HREF = { terms: "/terms", privacy: "/privacy" } as const;

function DocumentPanel({ doc, userCount }: { doc: LegalDocumentOverview; userCount: number }) {
  const label = LEGAL_DOCUMENT_LABELS[doc.document];
  const liveHash = legalContentHash(doc.document);
  const active = doc.active;
  return (
    <Panel title={label}>
      {active ? (
        <div className="flex flex-col gap-2 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-zinc-100">Version {active.version}</span>
            {active.contentHash === liveHash ? (
              <Badge variant="success">Matches the live text</Badge>
            ) : (
              <Badge variant="warning">Live text changed</Badge>
            )}
          </div>
          <p className="text-zinc-300">{active.summary}</p>
          <p className="text-xs text-zinc-400">
            Published {formatWhen(active.publishedAt)} by {active.publishedByEmail ?? "unknown admin"} ·{" "}
            {active.requiresAcceptance ? "Users must accept" : "No re-acceptance needed"} · Accepted by {doc.acceptedCount ?? "—"} of {userCount} users
          </p>
          {active.contentHash !== liveHash ? (
            <p className="text-xs text-amber-300">
              The text at {HREF[doc.document]} (last updated {LEGAL_LAST_UPDATED}) differs from what version {active.version} recorded. Publish a new version.
            </p>
          ) : null}
          {doc.history.length > 1 ? (
            <Collapsible>
              <CollapsibleTrigger className="text-xs text-zinc-400 hover:text-zinc-200">Earlier versions ({doc.history.length - 1})</CollapsibleTrigger>
              <CollapsibleContent className="pt-2">
                <ul className="flex flex-col gap-1 text-xs text-zinc-400">
                  {doc.history.slice(1).map((v) => (
                    <li key={v.id}>
                      {v.version} · {formatWhen(v.publishedAt)} · {v.summary}
                    </li>
                  ))}
                </ul>
              </CollapsibleContent>
            </Collapsible>
          ) : null}
        </div>
      ) : (
        <EmptyState>No version published. Users aren&apos;t asked to accept the {label} until one is.</EmptyState>
      )}
    </Panel>
  );
}

export default async function LegalPage() {
  const { documents, userCount } = await getLegalOverview();
  const bannerNeeded = consentBannerRequired();
  const firstUnpublished = documents.find((d) => !d.active)?.document ?? "terms";

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Legal</h1>
          <p className="text-sm text-zinc-400">The Terms and Privacy Policy versions users accept, and what the app stores in their browser.</p>
        </div>
        <PublishVersionDialog defaultDocument={firstUnpublished} />
      </div>

      {documents.map((doc) => (
        <DocumentPanel key={doc.document} doc={doc} userCount={userCount} />
      ))}

      <Panel title="Cookies and consent">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-zinc-100">Consent banner</span>
          {bannerNeeded ? <Badge variant="warning">Required</Badge> : <Badge variant="secondary">Not needed</Badge>}
        </div>
        <p className="text-xs text-zinc-400">
          {bannerNeeded
            ? "Something the app stores is analytics or marketing, which needs consent before it is set."
            : "Everything the app stores keeps you signed in or remembers a choice you made. A build check fails if code adds anything not listed here."}
        </p>
        <Collapsible>
          <CollapsibleTrigger className="text-xs text-zinc-400 hover:text-zinc-200">What the app stores ({COOKIE_INVENTORY.length})</CollapsibleTrigger>
          <CollapsibleContent className="pt-2">
            <ul className="flex flex-col divide-y divide-zinc-800 text-sm">
              {COOKIE_INVENTORY.map((item) => (
                <li key={item.name} className="flex flex-col gap-0.5 py-2 first:pt-0 last:pb-0">
                  <span className="font-mono text-xs text-zinc-100">{item.name}</span>
                  <span className="text-xs text-zinc-400">
                    {item.kind} · {item.category} · {item.lifetime} — {item.purpose}
                  </span>
                </li>
              ))}
            </ul>
          </CollapsibleContent>
        </Collapsible>
      </Panel>
    </div>
  );
}
