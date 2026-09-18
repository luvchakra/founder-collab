/**
 * Resend reports delivery outcomes asynchronously, after send.ts has already marked a
 * message 'sent'. The rule this encodes is that only failure-shaped events change
 * anything — and that an event we don't act on is a *result*, not an error, because the
 * webhook route turns a thrown error into a status the provider retries forever.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createFakeSupabase,
  eqFilters,
  usedOp,
  writtenRow,
  type RecordedQuery,
} from "@cofounderai/core/test-support/fake-supabase";

const { createAdminClient } = vi.hoisted(() => ({ createAdminClient: vi.fn() }));
vi.mock("../../db/admin", () => ({ createAdminClient }));

const { ingestSendStatus } = await import("./ingest-send-status");

const PROVIDER_ID = "resend-abc123";

/** `existing` is what the provider-id lookup finds; the update then returns `updated`. */
function mockAdmin(existing: unknown, updated: unknown = { id: "m1", status: "failed" }) {
  const supabase = createFakeSupabase({
    query: (call: RecordedQuery) =>
      usedOp(call, "update") ? { data: updated, error: null } : { data: existing, error: null },
  });
  createAdminClient.mockReturnValue(supabase);
  return supabase;
}

beforeEach(() => vi.clearAllMocks());

describe("ingestSendStatus", () => {
  it.each(["bounced", "failed", "complained"] as const)(
    "marks the message failed for a '%s' event",
    async (status) => {
      const supabase = mockAdmin({ id: "m1" });

      const result = await ingestSendStatus({ providerMessageId: PROVIDER_ID, status });

      expect(result.matched).toBe(true);
      expect(writtenRow(supabase.queries("messages")[1]!)).toMatchObject({ status: "failed" });
    },
  );

  it.each(["sent", "delivered"] as const)(
    "ignores a '%s' event without touching the database",
    async (status) => {
      const supabase = mockAdmin({ id: "m1" });

      const result = await ingestSendStatus({ providerMessageId: PROVIDER_ID, status });

      expect(result).toEqual({ matched: false, reason: `Ignored status: ${status}` });
      expect(supabase.queries()).toEqual([]);
    },
  );

  it("records the provider's reason when there is one", async () => {
    const supabase = mockAdmin({ id: "m1" });

    await ingestSendStatus({ providerMessageId: PROVIDER_ID, status: "bounced", reason: "mailbox full" });

    expect(writtenRow(supabase.queries("messages")[1]!)).toMatchObject({
      failure_reason: "mailbox full",
    });
  });

  it.each([
    ["no reason field", undefined],
    ["an explicitly null reason", null],
  ])("falls back to a generic reason given %s", async (_label, reason) => {
    const supabase = mockAdmin({ id: "m1" });

    await ingestSendStatus({ providerMessageId: PROVIDER_ID, status: "bounced", reason });

    expect(writtenRow(supabase.queries("messages")[1]!)).toMatchObject({
      failure_reason: "Delivery bounced.",
    });
  });

  it("finds the message by provider id, then updates it by its own primary key", async () => {
    const supabase = mockAdmin({ id: "m1" });

    await ingestSendStatus({ providerMessageId: PROVIDER_ID, status: "bounced" });

    expect(eqFilters(supabase.queries("messages")[0]!)).toEqual({ provider_message_id: PROVIDER_ID });
    expect(eqFilters(supabase.queries("messages")[1]!)).toEqual({ id: "m1" });
  });

  it("reports an unknown provider id as unmatched rather than throwing", async () => {
    mockAdmin(null);

    const result = await ingestSendStatus({ providerMessageId: PROVIDER_ID, status: "bounced" });

    expect(result).toEqual({ matched: false, reason: `No message found for ${PROVIDER_ID}.` });
  });

  it("returns the updated row so the caller can report which message changed", async () => {
    mockAdmin({ id: "m1" }, { id: "m1", status: "failed", failure_reason: "mailbox full" });

    const result = await ingestSendStatus({ providerMessageId: PROVIDER_ID, status: "bounced" });

    expect(result).toMatchObject({ matched: true, message: { id: "m1" } });
  });

  it("uses the admin client, since a webhook has no signed-in user", async () => {
    mockAdmin({ id: "m1" });

    await ingestSendStatus({ providerMessageId: PROVIDER_ID, status: "bounced" });

    expect(createAdminClient).toHaveBeenCalled();
  });

  it("propagates a failed lookup", async () => {
    createAdminClient.mockReturnValue(
      createFakeSupabase({ query: () => ({ data: null, error: new Error("select denied") }) }),
    );

    await expect(
      ingestSendStatus({ providerMessageId: PROVIDER_ID, status: "bounced" }),
    ).rejects.toThrow("select denied");
  });

  it("propagates a failed update", async () => {
    createAdminClient.mockReturnValue(
      createFakeSupabase({
        query: (call) =>
          usedOp(call, "update")
            ? { data: null, error: new Error("update denied") }
            : { data: { id: "m1" }, error: null },
      }),
    );

    await expect(
      ingestSendStatus({ providerMessageId: PROVIDER_ID, status: "bounced" }),
    ).rejects.toThrow("update denied");
  });
});
