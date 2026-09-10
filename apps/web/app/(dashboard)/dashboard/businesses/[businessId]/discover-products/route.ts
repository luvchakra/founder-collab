import { discoverProductsFromWebsite } from "@cofounderai/module-discovery/lib/ai/discover-products";
import type { DiscoveredProduct } from "@cofounderai/module-discovery/lib/ai/schemas";

/**
 * Streaming counterpart to `discoverProductsAction` (actions.ts) -- a plain Server
 * Action can only return one value once the whole call finishes, which is why that
 * action's own button only ever showed "Reading your website...". This Route Handler
 * gets the same session-cookie-authenticated Supabase client `discoverProductsFromWebsite`
 * already queries through (RLS still the authority on tenant access -- nothing here
 * skips it), but as a plain `Response` it can stream newline-delimited progress events
 * back to the client while the AI's own structuring call is still generating, via
 * `discoverProductsFromWebsite`'s new `onProgress` callback.
 */
export async function POST(_request: Request, { params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params;

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: { type: "progress"; products: Partial<DiscoveredProduct>[] } | { type: "done"; products: DiscoveredProduct[] } | { type: "error"; error: string }) => {
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      };
      try {
        const products = await discoverProductsFromWebsite(businessId, (partial) => {
          send({ type: "progress", products: partial });
        });
        send({ type: "done", products });
      } catch (error) {
        send({ type: "error", error: error instanceof Error ? error.message : "Something went wrong." });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson", "Cache-Control": "no-store" },
  });
}
