import { resolveApiKey } from "@cofounderai/core/api-v1/auth.server";
import { errorResponse } from "@cofounderai/core/api-v1/response";
import { readReleaseInfo } from "@cofounderai/core/admin/platform-release";
import { dispatchApiV1Request, serveOpenApiSpec } from "../v1/dispatch";
import { answerBusinessQuestion } from "@cofounderai/core/ai/business-assistant";
import { handleMcpBody, type McpServerDeps } from "@/lib/mcp/server";

/**
 * PLATFORM-P1-11.1 -- the MCP endpoint (Streamable HTTP, stateless, JSON responses only).
 * Connect with the endpoint https://<host>/api/mcp and a business API key as the bearer token.
 * Every POST checks the key first (401 on a bad or revoked key, 429 over the rate limit);
 * the tools then read through the public API v1 with that same key, so nothing here can
 * see another business, an unlicensed module, or write anything.
 */

export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 1_000_000;

function deps(origin: string, businessId: string): McpServerDeps {
  return {
    apiGet: (resource, id, query, authorization) => {
      const path = `/api/v1/${encodeURIComponent(resource)}${id ? `/${encodeURIComponent(id)}` : ""}`;
      const url = new URL(path, origin);
      url.search = query.toString();
      return dispatchApiV1Request(new Request(url, { method: "GET", headers: { authorization } }), resource, id, query);
    },
    // PLATFORM-P1-11.2: the business is the API key's own, never one named by the caller.
    askAssistant: (question, records) => answerBusinessQuestion({ businessId, question, records }),
    openApiSpec: () => serveOpenApiSpec().json(),
    version: readReleaseInfo().version ?? "dev",
  };
}

export async function POST(request: Request) {
  let businessId: string;
  try {
    businessId = (await resolveApiKey(request)).businessId;
  } catch (err) {
    const response = errorResponse(err);
    if (response.status === 401) response.headers.set("WWW-Authenticate", 'Bearer realm="wonderark"');
    return response;
  }

  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) {
    return Response.json({ jsonrpc: "2.0", id: null, error: { code: -32600, message: "Request too large." } }, { status: 413 });
  }
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return Response.json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error." } }, { status: 400 });
  }

  const authorization = request.headers.get("authorization") ?? "";
  const reply = await handleMcpBody(deps(new URL(request.url).origin, businessId), body, authorization);
  if (reply === null) return new Response(null, { status: 202 });
  return Response.json(reply);
}

/** No server-initiated stream is offered; clients POST every message. */
export function GET() {
  return new Response(null, { status: 405, headers: { Allow: "POST" } });
}

export function DELETE() {
  return new Response(null, { status: 405, headers: { Allow: "POST" } });
}
