import { getBusiness } from "@cofounderai/module-discovery/lib/tenancy/queries";
import {
  getWebsiteOnboardingRun,
} from "@cofounderai/module-discovery/lib/website-onboarding/queries";
import {
  markWebsiteOnboardingRunRunning,
  completeWebsiteOnboardingRun,
  failWebsiteOnboardingRun,
  recordWebsiteOnboardingPages,
} from "@cofounderai/module-discovery/lib/website-onboarding/mutations";
import { understandBusinessWebsite } from "@cofounderai/module-discovery/lib/ai/understand-business-website";
import type { CrawledPage } from "@cofounderai/module-discovery/lib/ai/website-crawl";

/**
 * Streaming counterpart to the WebsiteOnboardingPanel (business/page.tsx) -- same
 * NDJSON-over-a-plain-Response shape as discover-products/route.ts, driving the same
 * session-cookie-authenticated Supabase client every query/mutation here already runs
 * through (RLS is still the authority: a runId for a business this caller can't see
 * resolves to nothing, same as any other cross-tenant lookup in this app).
 *
 * Only ever advances a `pending` run -- a run already `running`/`succeeded`/`failed`
 * returns its current state as a single event and does nothing else, so a duplicate
 * client call (a second tab, a React effect re-firing) can never trigger the AI call
 * twice for the same run.
 */
export async function POST(_request: Request, { params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params;
  const body = (await _request.json().catch(() => null)) as { runId?: string } | null;
  const runId = body?.runId;

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (
        event:
          | { type: "progress"; profile: Record<string, unknown> }
          | { type: "page"; page: CrawledPage }
          | { type: "done"; profile: unknown }
          | { type: "error"; error: string }
          | { type: "noop"; status: string },
      ) => {
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      };

      try {
        if (!runId) {
          send({ type: "error", error: "Missing onboarding run." });
          return;
        }

        const run = await getWebsiteOnboardingRun(runId);
        if (!run || run.business_id !== businessId) {
          send({ type: "error", error: "Onboarding run not found." });
          return;
        }
        if (run.status !== "pending") {
          send({ type: "noop", status: run.status });
          return;
        }

        const business = await getBusiness(businessId);
        if (!business) {
          send({ type: "error", error: "Business not found." });
          return;
        }

        await markWebsiteOnboardingRunRunning(runId);

        const { profile, pages } = await understandBusinessWebsite(
          businessId,
          business.account_id,
          run.website,
          (partial) => send({ type: "progress", profile: partial }),
          (page) => send({ type: "page", page }),
        );

        await completeWebsiteOnboardingRun(runId, profile);
        await recordWebsiteOnboardingPages(runId, pages).catch(() => {});
        send({ type: "done", profile });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Something went wrong.";
        if (runId) {
          await failWebsiteOnboardingRun(runId, message).catch(() => {});
        }
        send({ type: "error", error: message });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson", "Cache-Control": "no-store" },
  });
}
