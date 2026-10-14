import { describe, expect, it, vi } from "vitest";
import { handleMcpBody, MCP_RESOURCES, toApiRequest, toAssistantRequest, type McpServerDeps } from "./server";

// PLATFORM-P1-11.1: the MCP server is a read-only adapter over the public API v1.

function makeDeps(response: Response = Response.json({ data: [], meta: { limit: 25, offset: 0, count: 0 } })) {
  const apiGet = vi.fn<McpServerDeps["apiGet"]>(async () => response.clone());
  const askAssistant = vi.fn<McpServerDeps["askAssistant"]>(async () => ({ answer: "Two customers.", answered: true, usedResources: ["customers"] }));
  const draftWhatsAppReply = vi.fn<McpServerDeps["draftWhatsAppReply"]>(async () => ({ status: "answered", answer: "Open 10 to 7.", topic: "hours_location_contact", factsUsed: [] }));
  return {
    deps: { apiGet, askAssistant, draftWhatsAppReply, openApiSpec: () => ({ openapi: "3.0.0" }), version: "abc1234" } satisfies McpServerDeps,
    apiGet,
    askAssistant,
    draftWhatsAppReply,
  };
}

const AUTH = "Bearer sk_live_" + "a".repeat(32);

describe("MCP protocol", () => {
  it("negotiates the client's protocol version when supported, else the latest", async () => {
    const { deps } = makeDeps();
    const asked = await handleMcpBody(deps, { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-03-26" } }, AUTH);
    expect(asked).toMatchObject({ id: 1, result: { protocolVersion: "2025-03-26", serverInfo: { name: "wonderark", version: "abc1234" } } });
    const unknown = await handleMcpBody(deps, { jsonrpc: "2.0", id: 2, method: "initialize", params: { protocolVersion: "1999-01-01" } }, AUTH);
    expect(unknown).toMatchObject({ result: { protocolVersion: "2025-06-18" } });
  });

  it("answers nothing to notifications (HTTP 202)", async () => {
    const { deps } = makeDeps();
    expect(await handleMcpBody(deps, { jsonrpc: "2.0", method: "notifications/initialized" }, AUTH)).toBeNull();
    expect(await handleMcpBody(deps, [{ jsonrpc: "2.0", method: "notifications/initialized" }], AUTH)).toBeNull();
  });

  it("lists the tools; only the reply draft writes (a draft), and nothing is destructive", async () => {
    const { deps } = makeDeps();
    const reply = (await handleMcpBody(deps, { jsonrpc: "2.0", id: 3, method: "tools/list" }, AUTH)) as {
      result: { tools: { name: string; annotations: { readOnlyHint: boolean; destructiveHint: boolean } }[] };
    };
    expect(reply.result.tools.map((t) => t.name)).toEqual(["list_records", "get_record", "ask_assistant", "draft_whatsapp_reply"]);
    expect(reply.result.tools.filter((t) => !t.annotations.readOnlyHint).map((t) => t.name)).toEqual(["draft_whatsapp_reply"]);
    expect(reply.result.tools.every((t) => !t.annotations.destructiveHint)).toBe(true);
  });

  it("serves the API's OpenAPI document as a resource", async () => {
    const { deps } = makeDeps();
    const list = await handleMcpBody(deps, { jsonrpc: "2.0", id: 4, method: "resources/list" }, AUTH);
    expect(list).toMatchObject({ result: { resources: [{ uri: "wonderark://api/openapi.json" }] } });
    const read = await handleMcpBody(deps, { jsonrpc: "2.0", id: 5, method: "resources/read", params: { uri: "wonderark://api/openapi.json" } }, AUTH);
    expect(read).toMatchObject({ result: { contents: [{ text: '{"openapi":"3.0.0"}' }] } });
    const other = await handleMcpBody(deps, { jsonrpc: "2.0", id: 6, method: "resources/read", params: { uri: "file:///etc/passwd" } }, AUTH);
    expect(other).toMatchObject({ error: { code: -32602 } });
  });

  it("rejects unknown methods and malformed messages", async () => {
    const { deps } = makeDeps();
    expect(await handleMcpBody(deps, { jsonrpc: "2.0", id: 7, method: "tools/delete" }, AUTH)).toMatchObject({ error: { code: -32601 } });
    expect(await handleMcpBody(deps, "nope", AUTH)).toMatchObject({ error: { code: -32600 } });
  });
});

describe("tools", () => {
  it("lists records through the API with the caller's own key", async () => {
    const { deps, apiGet } = makeDeps();
    const reply = await handleMcpBody(
      deps,
      { jsonrpc: "2.0", id: 8, method: "tools/call", params: { name: "list_records", arguments: { resource: "customers", limit: 10, offset: 20 } } },
      AUTH,
    );
    expect(apiGet).toHaveBeenCalledTimes(1);
    const [resource, id, query, authorization] = apiGet.mock.calls[0]!;
    expect([resource, id, query.toString(), authorization]).toEqual(["customers", undefined, "limit=10&offset=20", AUTH]);
    expect(reply).toMatchObject({ result: { isError: false, content: [{ type: "text" }] } });
  });

  it("reports a refused read (e.g. an unlicensed module) as a tool error, never a success", async () => {
    const { deps } = makeDeps(Response.json({ error: { code: "MODULE_NOT_LICENSED" } }, { status: 403 }));
    const reply = await handleMcpBody(deps, { jsonrpc: "2.0", id: 9, method: "tools/call", params: { name: "get_record", arguments: { resource: "jobs", id: "abc" } } }, AUTH);
    expect(reply).toMatchObject({ result: { isError: true, content: [{ text: expect.stringContaining("MODULE_NOT_LICENSED") }] } });
  });

  it("validates agent-supplied arguments before any request", async () => {
    const { deps, apiGet } = makeDeps();
    const bad = [
      { name: "list_records", arguments: { resource: "users" } },
      { name: "list_records", arguments: { resource: "customers", limit: 1000 } },
      { name: "list_records", arguments: { resource: "customers", offset: -1 } },
      { name: "get_record", arguments: { resource: "customers", id: "../../admin" } },
      { name: "delete_record", arguments: { resource: "customers", id: "x" } },
    ];
    for (const params of bad) {
      expect(await handleMcpBody(deps, { jsonrpc: "2.0", id: 10, method: "tools/call", params }, AUTH)).toMatchObject({ error: { code: -32602 } });
    }
    expect(apiGet).not.toHaveBeenCalled();
  });

  it("maps every tool to a read (no id → list, id → one record)", () => {
    for (const resource of MCP_RESOURCES) {
      const list = toApiRequest("list_records", { resource });
      expect(list.resource).toBe(resource);
      expect(list.id).toBeUndefined();
      expect(toApiRequest("get_record", { resource, id: "x1" })).toMatchObject({ resource, id: "x1" });
    }
  });
});

// PLATFORM-P1-11.2: ask_assistant, WonderArk's AI agent over MCP.
describe("ask_assistant", () => {
  const ask = (args: Record<string, unknown>) => ({ jsonrpc: "2.0", id: 20, method: "tools/call", params: { name: "ask_assistant", arguments: args } });
  const parse = (reply: unknown) => {
    const r = reply as { result: { isError: boolean; content: { text: string }[] } };
    return { isError: r.result.isError, body: JSON.parse(r.result.content[0]!.text) };
  };

  it("reads the chosen records with the caller's own key, then answers from exactly those", async () => {
    const { deps, apiGet, askAssistant } = makeDeps(Response.json({ data: [{ id: "c1", name: "Asha" }] }));
    const { isError, body } = parse(await handleMcpBody(deps, ask({ question: "How many customers?", resources: ["customers"] }), AUTH));
    expect(apiGet).toHaveBeenCalledTimes(1);
    const [resource, id, query, authorization] = apiGet.mock.calls[0]!;
    expect([resource, id, query.toString(), authorization]).toEqual(["customers", undefined, "limit=25", AUTH]);
    expect(askAssistant).toHaveBeenCalledWith("How many customers?", [{ resource: "customers", data: [{ id: "c1", name: "Asha" }] }]);
    expect(isError).toBe(false);
    expect(body).toEqual({ answer: "Two customers.", answered: true, sources: ["customers"], skipped: [], provenance: "ai-generated" });
  });

  it("defaults to every kind of record, and skips (and reports) what the key can't read", async () => {
    const { deps, apiGet, askAssistant } = makeDeps();
    apiGet.mockImplementation(async (resource) =>
      resource === "jobs" ? Response.json({ error: { code: "MODULE_NOT_LICENSED" } }, { status: 403 }) : Response.json({ data: [] }),
    );
    const { body } = parse(await handleMcpBody(deps, ask({ question: "Anything overdue?" }), AUTH));
    expect(apiGet.mock.calls.map((c) => c[0])).toEqual([...MCP_RESOURCES]);
    expect(apiGet.mock.calls.every((c) => c[3] === AUTH)).toBe(true);
    expect(body.skipped).toEqual([{ resource: "jobs", status: 403 }]);
    expect(askAssistant.mock.calls[0]![1].map((r) => r.resource)).not.toContain("jobs");
  });

  it("never calls the model when the key can read nothing", async () => {
    const { deps, askAssistant } = makeDeps(Response.json({ error: { code: "MODULE_NOT_LICENSED" } }, { status: 403 }));
    const { isError, body } = parse(await handleMcpBody(deps, ask({ question: "Stock?", resources: ["products"] }), AUTH));
    expect(isError).toBe(true);
    expect(body.skipped).toEqual([{ resource: "products", status: 403 }]);
    expect(askAssistant).not.toHaveBeenCalled();
  });

  it("reports a failed answer (AI off, provider down) as a tool error, never an answer", async () => {
    const { deps, askAssistant } = makeDeps();
    askAssistant.mockRejectedValue(new Error("The AI assistant isn't configured on this deployment."));
    const { isError, body } = parse(await handleMcpBody(deps, ask({ question: "Sales today?", resources: ["sales-orders"] }), AUTH));
    expect(isError).toBe(true);
    expect(body.error).toContain("isn't configured");
    expect(body.answer).toBeUndefined();
  });

  it("validates the question and resources before any read", async () => {
    const { deps, apiGet } = makeDeps();
    for (const args of [{}, { question: "" }, { question: "x".repeat(501) }, { question: "q", resources: [] }, { question: "q", resources: ["users"] }, { question: "q", resources: "customers" }]) {
      expect(await handleMcpBody(deps, ask(args), AUTH)).toMatchObject({ error: { code: -32602 } });
    }
    expect(apiGet).not.toHaveBeenCalled();
    expect(toAssistantRequest({ question: " q ", resources: ["jobs", "jobs"] })).toEqual({ question: "q", resources: ["jobs"] });
  });
});

// PLATFORM-P1-12.7: draft_whatsapp_reply drafts, never sends.
describe("draft_whatsapp_reply", () => {
  const CONV = "0f0e8a7c-1d2b-4c3d-9e8f-123456789abc";
  const call = (args: Record<string, unknown>) => ({ jsonrpc: "2.0", id: 20, method: "tools/call", params: { name: "draft_whatsapp_reply", arguments: args } });

  it("validates the conversation id before doing anything", async () => {
    const { deps, draftWhatsAppReply } = makeDeps();
    for (const conversation_id of [undefined, "abc", "../x", 42]) {
      expect(await handleMcpBody(deps, call({ conversation_id }), AUTH)).toMatchObject({ error: { code: -32602 } });
    }
    expect(draftWhatsAppReply).not.toHaveBeenCalled();
  });

  it("returns the draft marked as AI-generated and not sent, reading orders and jobs with the caller's key", async () => {
    const { deps, apiGet, draftWhatsAppReply } = makeDeps(Response.json({ data: [{ id: "o1", customer_id: "p1" }] }));
    draftWhatsAppReply.mockImplementation(async (_id, readList) => ({ status: "answered", orders: await readList("sales-orders") }));
    const reply = (await handleMcpBody(deps, call({ conversation_id: CONV }), AUTH)) as { result: { isError: boolean; content: { text: string }[] } };
    expect(reply.result.isError).toBe(false);
    expect(JSON.parse(reply.result.content[0]!.text)).toMatchObject({ status: "answered", provenance: "ai-generated", sent: false, orders: [{ id: "o1" }] });
    expect(draftWhatsAppReply.mock.calls[0]![0]).toBe(CONV);
    expect(apiGet).toHaveBeenCalledWith("sales-orders", undefined, expect.any(URLSearchParams), AUTH);
  });

  it("reports a refusal (no licence, no permission, AI off) as a tool error", async () => {
    const { deps, draftWhatsAppReply } = makeDeps();
    draftWhatsAppReply.mockRejectedValue(new Error("MODULE_NOT_LICENSED: this business doesn't have an active CRM licence."));
    const reply = (await handleMcpBody(deps, call({ conversation_id: CONV }), AUTH)) as { result: { isError: boolean; content: { text: string }[] } };
    expect(reply.result.isError).toBe(true);
    expect(reply.result.content[0]!.text).toContain("MODULE_NOT_LICENSED");
  });

  it("treats an unreadable order or job list as no facts, not a failure", async () => {
    const { deps, draftWhatsAppReply } = makeDeps(Response.json({ error: { code: "module_not_licensed" } }, { status: 403 }));
    draftWhatsAppReply.mockImplementation(async (_id, readList) => ({ status: "answered", jobs: await readList("jobs") }));
    const reply = (await handleMcpBody(deps, call({ conversation_id: CONV }), AUTH)) as { result: { content: { text: string }[] } };
    expect(JSON.parse(reply.result.content[0]!.text)).toMatchObject({ jobs: null });
  });
});
