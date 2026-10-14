import { describe, expect, it, vi } from "vitest";
import { handleMcpBody, MCP_RESOURCES, toApiRequest, type McpServerDeps } from "./server";

// PLATFORM-P1-11.1: the MCP server is a read-only adapter over the public API v1.

function makeDeps(response: Response = Response.json({ data: [], meta: { limit: 25, offset: 0, count: 0 } })) {
  const apiGet = vi.fn<McpServerDeps["apiGet"]>(async () => response);
  return { deps: { apiGet, openApiSpec: () => ({ openapi: "3.0.0" }), version: "abc1234" } satisfies McpServerDeps, apiGet };
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

  it("lists only read-only tools", async () => {
    const { deps } = makeDeps();
    const reply = (await handleMcpBody(deps, { jsonrpc: "2.0", id: 3, method: "tools/list" }, AUTH)) as { result: { tools: { name: string; annotations: { readOnlyHint: boolean } }[] } };
    expect(reply.result.tools.map((t) => t.name)).toEqual(["list_records", "get_record"]);
    expect(reply.result.tools.every((t) => t.annotations.readOnlyHint)).toBe(true);
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
