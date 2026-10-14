/**
 * PLATFORM-P1-11.1 -- WonderArk's MCP server (Model Context Protocol, Streamable HTTP,
 * stateless, JSON responses). Read-only by construction: every tool is a GET against the
 * public API v1 (`/api/v1/<resource>`), authenticated with the same business API key
 * (`Authorization: Bearer sk_live_...`). So the key's business, its module licences, its
 * permission snapshot and its rate limit all apply unchanged -- this file adds no access of
 * its own, and it never writes.
 *
 * Arguments come from an external agent: they are validated here (resource from a fixed
 * list, id and paging bounded) and never reach anything but the API dispatcher.
 *
 * PLATFORM-P1-11.2 -- `ask_assistant` is WonderArk's AI agent: it reads records through
 * that same API with the caller's own key, then has the assistant answer from them. The
 * model only writes an answer; it chooses no records and calls nothing.
 */

export const MCP_PROTOCOL_VERSIONS = ["2025-06-18", "2025-03-26", "2024-11-05"] as const;

/** Every resource the public API v1 serves, by module (each still checks its own licence). */
export const MCP_RESOURCES = [
  "products",
  "warehouses",
  "inventory",
  "purchase-orders",
  "sales-orders",
  "customers",
  "suppliers",
  "sales-invoices",
  "jobs",
  "tickets",
  "einvoices",
] as const;

const MAX_LIMIT = 100;
/** Rows read per resource to ground one ask_assistant answer. */
const ASSIST_ROWS_PER_RESOURCE = 25;
const MAX_QUESTION_LENGTH = 500;

/** Runs a read-only API v1 request (`GET /api/v1/<resource>[/<id>]?<query>`) with the
 * caller's own Authorization header and returns its Response. */
export type ApiGet = (resource: string, id: string | undefined, query: URLSearchParams, authorization: string) => Promise<Response>;

type JsonRpcId = string | number | null;
type JsonRpcMessage = { jsonrpc?: unknown; id?: JsonRpcId; method?: unknown; params?: unknown };
type JsonRpcResponse =
  | { jsonrpc: "2.0"; id: JsonRpcId; result: unknown }
  | { jsonrpc: "2.0"; id: JsonRpcId; error: { code: number; message: string } };

const TOOLS = [
  {
    name: "list_records",
    title: "List records",
    description:
      "Lists records of one kind from this business (newest first, paged). Returns { data, meta: { limit, offset, count } }. A module the business doesn't license answers MODULE_NOT_LICENSED.",
    inputSchema: {
      type: "object",
      properties: {
        resource: { type: "string", enum: [...MCP_RESOURCES], description: "Which records to list." },
        limit: { type: "integer", minimum: 1, maximum: MAX_LIMIT, description: "How many (default 25)." },
        offset: { type: "integer", minimum: 0, description: "How many to skip (default 0)." },
      },
      required: ["resource"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: "get_record",
    title: "Get a record",
    description: "Reads one record of one kind from this business by its id.",
    inputSchema: {
      type: "object",
      properties: {
        resource: { type: "string", enum: [...MCP_RESOURCES], description: "Which kind of record." },
        id: { type: "string", description: "The record's id." },
      },
      required: ["resource", "id"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: "ask_assistant",
    title: "Ask the WonderArk assistant",
    description:
      "Asks WonderArk's AI assistant a question about this business. It reads the latest records of the chosen kinds (all kinds this key can read when omitted) and answers only from them. Returns { answer, answered, sources, skipped, provenance: \"ai-generated\" }. Changes nothing.",
    inputSchema: {
      type: "object",
      properties: {
        question: { type: "string", minLength: 1, maxLength: MAX_QUESTION_LENGTH, description: "The question, in plain words." },
        resources: {
          type: "array",
          items: { type: "string", enum: [...MCP_RESOURCES] },
          uniqueItems: true,
          description: "Which kinds of records to answer from (default: all).",
        },
      },
      required: ["question"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  },
] as const;

const OPENAPI_URI = "wonderark://api/openapi.json";

/** What the assistant answers with; see @cofounderai/core/ai/business-assistant. */
export type AssistantAnswer = { answer: string; answered: boolean; usedResources: string[] };

/** Answers a question from records already read with the caller's key. Throws an Error
 * whose message is safe to show when it can't (AI off, not configured, provider down). */
export type AskAssistant = (question: string, records: { resource: string; data: unknown[] }[]) => Promise<AssistantAnswer>;

export type McpServerDeps = {
  apiGet: ApiGet;
  askAssistant: AskAssistant;
  /** The public API's OpenAPI document, offered as an MCP resource. */
  openApiSpec: () => unknown;
  version: string;
};

class InvalidParams extends Error {}

function isResource(value: unknown): value is (typeof MCP_RESOURCES)[number] {
  return typeof value === "string" && (MCP_RESOURCES as readonly string[]).includes(value);
}

function toolArgs(params: unknown): { name: string; args: Record<string, unknown> } {
  const p = (params ?? {}) as { name?: unknown; arguments?: unknown };
  if (typeof p.name !== "string") throw new InvalidParams("Tool name is required.");
  const args = p.arguments && typeof p.arguments === "object" && !Array.isArray(p.arguments) ? (p.arguments as Record<string, unknown>) : {};
  return { name: p.name, args };
}

/** Validates a tool call into the API request it maps to. Throws InvalidParams. */
/** Validates ask_assistant's arguments. Throws InvalidParams. */
export function toAssistantRequest(args: Record<string, unknown>): { question: string; resources: string[] } {
  const question = typeof args.question === "string" ? args.question.trim() : "";
  if (question.length === 0 || question.length > MAX_QUESTION_LENGTH) {
    throw new InvalidParams(`question must be 1 to ${MAX_QUESTION_LENGTH} characters.`);
  }
  if (args.resources === undefined) return { question, resources: [...MCP_RESOURCES] };
  if (!Array.isArray(args.resources) || args.resources.length === 0 || !args.resources.every(isResource)) {
    throw new InvalidParams(`resources must be a non-empty list of: ${MCP_RESOURCES.join(", ")}`);
  }
  return { question, resources: [...new Set(args.resources)] };
}

export function toApiRequest(name: string, args: Record<string, unknown>): { resource: string; id?: string; query: URLSearchParams } {
  if (name !== "list_records" && name !== "get_record") throw new InvalidParams(`Unknown tool: ${name}`);
  if (!isResource(args.resource)) throw new InvalidParams(`resource must be one of: ${MCP_RESOURCES.join(", ")}`);
  const query = new URLSearchParams();
  if (name === "get_record") {
    const id = args.id;
    if (typeof id !== "string" || !/^[A-Za-z0-9_-]{1,100}$/.test(id)) throw new InvalidParams("id must be 1 to 100 letters, digits, '-' or '_'.");
    return { resource: args.resource, id, query };
  }
  for (const key of ["limit", "offset"] as const) {
    const value = args[key];
    if (value === undefined) continue;
    const max = key === "limit" ? MAX_LIMIT : Number.MAX_SAFE_INTEGER;
    const min = key === "limit" ? 1 : 0;
    if (typeof value !== "number" || !Number.isInteger(value) || value < min || value > max) {
      throw new InvalidParams(`${key} must be a whole number from ${min}${key === "limit" ? ` to ${MAX_LIMIT}` : ""}.`);
    }
    query.set(key, String(value));
  }
  return { resource: args.resource, query };
}

function textResult(value: unknown, isError: boolean) {
  return { content: [{ type: "text", text: JSON.stringify(value) }], isError };
}

async function askAssistant(deps: McpServerDeps, args: Record<string, unknown>, authorization: string) {
  const { question, resources } = toAssistantRequest(args);
  // Read every chosen kind with the caller's own key: what the key can't read (module not
  // licensed, no permission) is skipped and reported, never worked around.
  const query = new URLSearchParams({ limit: String(ASSIST_ROWS_PER_RESOURCE) });
  const reads = await Promise.all(
    resources.map(async (resource) => {
      const response = await deps.apiGet(resource, undefined, query, authorization);
      if (!response.ok) return { resource, status: response.status, data: null };
      const body = (await response.json().catch(() => null)) as { data?: unknown } | null;
      return { resource, status: response.status, data: Array.isArray(body?.data) ? body.data : null };
    }),
  );
  const records = reads.filter((r) => r.data !== null).map((r) => ({ resource: r.resource, data: r.data as unknown[] }));
  const skipped = reads.filter((r) => r.data === null).map((r) => ({ resource: r.resource, status: r.status }));
  if (records.length === 0) {
    return textResult({ error: "This key can't read any of the records asked about, so there is nothing to answer from.", skipped }, true);
  }
  try {
    const reply = await deps.askAssistant(question, records);
    return textResult(
      {
        answer: reply.answer,
        answered: reply.answered,
        sources: reply.usedResources,
        skipped,
        provenance: "ai-generated",
      },
      false,
    );
  } catch (err) {
    // A failed answer is reported as a failure, never as an answer.
    return textResult({ error: err instanceof Error ? err.message : "The assistant could not answer.", skipped }, true);
  }
}

async function callTool(deps: McpServerDeps, params: unknown, authorization: string) {
  const { name, args } = toolArgs(params);
  if (name === "ask_assistant") return askAssistant(deps, args, authorization);
  const req = toApiRequest(name, args);
  const response = await deps.apiGet(req.resource, req.id, req.query, authorization);
  const text = await response.text();
  // A refused or failed read (unlicensed module, missing permission, not found, rate limit)
  // is a normal tool result the agent can read, flagged as an error -- never a success.
  return { content: [{ type: "text", text }], isError: !response.ok };
}

async function handleOne(deps: McpServerDeps, message: JsonRpcMessage, authorization: string): Promise<JsonRpcResponse | null> {
  const isRequest = message.id !== undefined && message.id !== null;
  if (typeof message.method !== "string") {
    // A response or a malformed message: nothing to answer for a response.
    return isRequest ? { jsonrpc: "2.0", id: message.id ?? null, error: { code: -32600, message: "Invalid request." } } : null;
  }
  if (!isRequest) return null; // notifications (initialized, cancelled, ...) need no reply
  const id = message.id as JsonRpcId;
  const ok = (result: unknown): JsonRpcResponse => ({ jsonrpc: "2.0", id, result });
  try {
    switch (message.method) {
      case "initialize": {
        const asked = (message.params as { protocolVersion?: unknown } | undefined)?.protocolVersion;
        const protocolVersion = (MCP_PROTOCOL_VERSIONS as readonly unknown[]).includes(asked) ? asked : MCP_PROTOCOL_VERSIONS[0];
        return ok({
          protocolVersion,
          capabilities: { tools: { listChanged: false }, resources: { listChanged: false, subscribe: false } },
          serverInfo: { name: "wonderark", title: "WonderArk", version: deps.version },
          instructions:
            "Read-only access to one WonderArk business, scoped by the API key used to connect. Use list_records and get_record to read records, and ask_assistant to have WonderArk's AI assistant answer a question from them; nothing here changes any data.",
        });
      }
      case "ping":
        return ok({});
      case "tools/list":
        return ok({ tools: TOOLS });
      case "tools/call":
        return ok(await callTool(deps, message.params, authorization));
      case "resources/list":
        return ok({
          resources: [{ uri: OPENAPI_URI, name: "openapi", title: "WonderArk API v1 (OpenAPI)", mimeType: "application/json" }],
        });
      case "resources/templates/list":
        return ok({ resourceTemplates: [] });
      case "resources/read": {
        const uri = (message.params as { uri?: unknown } | undefined)?.uri;
        if (uri !== OPENAPI_URI) throw new InvalidParams(`Unknown resource: ${String(uri)}`);
        return ok({ contents: [{ uri: OPENAPI_URI, mimeType: "application/json", text: JSON.stringify(deps.openApiSpec()) }] });
      }
      default:
        return { jsonrpc: "2.0", id, error: { code: -32601, message: `Method not found: ${message.method}` } };
    }
  } catch (err) {
    if (err instanceof InvalidParams) return { jsonrpc: "2.0", id, error: { code: -32602, message: err.message } };
    return { jsonrpc: "2.0", id, error: { code: -32603, message: "Internal error." } };
  }
}

/** Handles one POSTed body (a message or a batch). Returns the JSON to send back, or null
 * when there is nothing to answer (only notifications/responses: HTTP 202). */
export async function handleMcpBody(deps: McpServerDeps, body: unknown, authorization: string): Promise<unknown | null> {
  if (Array.isArray(body)) {
    const replies = (await Promise.all(body.map((m) => handleOne(deps, (m ?? {}) as JsonRpcMessage, authorization)))).filter(
      (r): r is JsonRpcResponse => r !== null,
    );
    return replies.length > 0 ? replies : null;
  }
  if (!body || typeof body !== "object") {
    return { jsonrpc: "2.0", id: null, error: { code: -32600, message: "Invalid request." } };
  }
  return handleOne(deps, body as JsonRpcMessage, authorization);
}
