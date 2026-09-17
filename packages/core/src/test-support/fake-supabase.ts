/**
 * Minimal in-memory stand-in for a `SupabaseClient`, for unit-testing the TypeScript
 * layer that sits on top of the database (licensing lifecycle, the domain-event drain
 * loop, RBAC guards) without a live Postgres.
 *
 * This is deliberately NOT a replacement for the real RLS tests in `scripts/` — those
 * run the whole migration timeline against a throwaway database and are the only thing
 * that can prove `tenant AND licensed` actually holds (CLAUDE.md non-negotiable #2).
 * What the database cannot easily prove is the *branching* in our own code: that an
 * unlicensed `required_module` parks rather than fails, that reactivation replays parked
 * events, that a 30-day grace window is what `deactivateLicense()` writes. That branching
 * is what this fake exists to pin down, and it lives here (rather than being rebuilt in
 * each test file) for the same reason `scripts/lib/rls-test-harness.mjs` does.
 *
 * Every chainable PostgREST method is accepted and recorded; the test supplies a single
 * `query`/`rpc` responder that sees the whole recorded call and decides what comes back.
 * Nothing here interprets the chain — a test asserting on `.eq("status", "grace")` reads
 * it back out of the recorded ops itself, so this file never has to grow a query engine.
 */

export type QueryResult<T = unknown> = { data: T; error: unknown };

export type RecordedOp = { method: string; args: unknown[] };

/** One `supabase.from(table)...` chain, as recorded when it was finally awaited. */
export type RecordedQuery = { kind: "query"; table: string; ops: RecordedOp[] };

/** One `supabase.rpc(fn, args)` call. */
export type RecordedRpc = { kind: "rpc"; fn: string; args: Record<string, unknown> };

/** One `supabase.storage.from(bucket).<method>(...)` call. */
export type RecordedStorage = {
  kind: "storage";
  bucket: string;
  method: string;
  args: unknown[];
};

export type RecordedCall = RecordedQuery | RecordedRpc | RecordedStorage;

export interface FakeSupabaseSpec {
  /** Responds to a `from(...)` chain. Defaults to `{ data: null, error: null }`. */
  query?: (call: RecordedQuery) => QueryResult;
  /** Responds to an `rpc(...)` call. Defaults to `{ data: null, error: null }`. */
  rpc?: (call: RecordedRpc) => QueryResult;
  /** Responds to a `storage.from(bucket).*` call. Defaults to `{ data: null, error: null }`. */
  storage?: (call: RecordedStorage) => QueryResult;
}

const CHAIN_METHODS = [
  "select", "insert", "update", "upsert", "delete",
  "eq", "neq", "gt", "gte", "lt", "lte", "like", "ilike", "is", "in", "contains",
  "not", "or", "filter", "match",
  "order", "limit", "range", "single", "maybeSingle",
] as const;

const EMPTY: QueryResult = { data: null, error: null };

const STORAGE_METHODS = [
  "upload", "download", "remove", "list", "move", "copy",
  "createSignedUrl", "createSignedUrls", "getPublicUrl",
] as const;

export interface FakeSupabase {
  from(table: string): Record<string, (...args: unknown[]) => unknown>;
  rpc(fn: string, args?: Record<string, unknown>): PromiseLike<QueryResult>;
  storage: { from(bucket: string): Record<string, (...args: unknown[]) => unknown> };
  /** Every call made against this client, in the order they resolved. */
  readonly calls: RecordedCall[];
  /** Just the `from(...)` chains — the common case in assertions. */
  queries(table?: string): RecordedQuery[];
  /** Just the `rpc(...)` calls, optionally filtered by function name. */
  rpcs(fn?: string): RecordedRpc[];
  /** Just the storage calls, optionally filtered by method name. */
  storageCalls(method?: string): RecordedStorage[];
}

export function createFakeSupabase(spec: FakeSupabaseSpec = {}): FakeSupabase {
  const calls: RecordedCall[] = [];

  function from(table: string) {
    const ops: RecordedOp[] = [];
    const builder: Record<string, unknown> = {};

    for (const method of CHAIN_METHODS) {
      builder[method] = (...args: unknown[]) => {
        ops.push({ method, args });
        return builder;
      };
    }

    // The chain resolves only when awaited, so the responder always sees the complete
    // call (including a trailing .single()/.maybeSingle()) rather than a partial one.
    builder.then = (onFulfilled?: unknown, onRejected?: unknown) => {
      const call: RecordedQuery = { kind: "query", table, ops };
      calls.push(call);
      return Promise.resolve()
        .then(() => (spec.query ? spec.query(call) : EMPTY))
        .then(onFulfilled as never, onRejected as never);
    };

    return builder as Record<string, (...args: unknown[]) => unknown>;
  }

  function rpc(fn: string, args: Record<string, unknown> = {}) {
    const call: RecordedRpc = { kind: "rpc", fn, args };
    calls.push(call);
    return Promise.resolve().then(() => (spec.rpc ? spec.rpc(call) : EMPTY));
  }

  const storage = {
    from(bucket: string) {
      const api: Record<string, unknown> = {};
      for (const method of STORAGE_METHODS) {
        api[method] = (...args: unknown[]) => {
          const call: RecordedStorage = { kind: "storage", bucket, method, args };
          calls.push(call);
          return Promise.resolve().then(() => (spec.storage ? spec.storage(call) : EMPTY));
        };
      }
      return api as Record<string, (...args: unknown[]) => unknown>;
    },
  };

  return {
    from,
    rpc,
    storage,
    calls,
    queries: (table?: string) =>
      calls.filter(
        (c): c is RecordedQuery => c.kind === "query" && (table === undefined || c.table === table),
      ),
    rpcs: (fn?: string) =>
      calls.filter((c): c is RecordedRpc => c.kind === "rpc" && (fn === undefined || c.fn === fn)),
    storageCalls: (method?: string) =>
      calls.filter(
        (c): c is RecordedStorage =>
          c.kind === "storage" && (method === undefined || c.method === method),
      ),
  };
}

/** Args of the first `method` op in a recorded chain, or `undefined` if never called. */
export function opArgs(call: RecordedQuery, method: string): unknown[] | undefined {
  return call.ops.find((op) => op.method === method)?.args;
}

/** True if the chain used `method` at all. */
export function usedOp(call: RecordedQuery, method: string): boolean {
  return call.ops.some((op) => op.method === method);
}

/** Every `.eq(column, value)` filter on a chain, flattened to an object. */
export function eqFilters(call: RecordedQuery): Record<string, unknown> {
  const filters: Record<string, unknown> = {};
  for (const op of call.ops) {
    if (op.method === "eq") filters[op.args[0] as string] = op.args[1];
  }
  return filters;
}

/** The row passed to `.insert(...)` / `.update(...)` on a chain. */
export function writtenRow(call: RecordedQuery): Record<string, unknown> | undefined {
  const write = call.ops.find((op) => op.method === "insert" || op.method === "update");
  return write?.args[0] as Record<string, unknown> | undefined;
}
