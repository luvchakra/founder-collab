import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeSupabase, opArgs, writtenRow } from "../test-support/fake-supabase";

const { createClient } = vi.hoisted(() => ({ createClient: vi.fn() }));
vi.mock("../db/server", () => ({ createClient }));

const { createCustomFieldDef, setCustomFieldValue } = await import("./mutations");

const BUSINESS = "b0000000-0000-0000-0000-000000000001";

function mock(data: unknown = { id: "def-1" }, error: unknown = null) {
  const supabase = createFakeSupabase({ query: () => ({ data, error }) });
  createClient.mockResolvedValue(supabase);
  return supabase;
}

const DEF = {
  businessId: BUSINESS,
  entityType: "job",
  key: "meter_reading",
  label: "Meter reading",
  fieldType: "number" as const,
};

beforeEach(() => vi.clearAllMocks());

describe("createCustomFieldDef", () => {
  it("applies the documented defaults", async () => {
    const supabase = mock();

    await createCustomFieldDef(DEF);

    expect(writtenRow(supabase.queries("custom_field_defs")[0]!)).toEqual({
      business_id: BUSINESS,
      entity_type: "job",
      service_type_id: null,
      key: "meter_reading",
      label: "Meter reading",
      field_type: "number",
      options: null,
      is_required: false,
      sort_order: 0,
    });
  });

  it("carries select options and a service-type scope through", async () => {
    const supabase = mock();

    await createCustomFieldDef({
      ...DEF,
      fieldType: "select",
      options: ["A", "B"],
      serviceTypeId: "svc-1",
      isRequired: true,
      sortOrder: 3,
    });

    expect(writtenRow(supabase.queries("custom_field_defs")[0]!)).toMatchObject({
      field_type: "select",
      options: ["A", "B"],
      service_type_id: "svc-1",
      is_required: true,
      sort_order: 3,
    });
  });

  it("propagates a failure", async () => {
    mock(null, new Error("denied"));
    await expect(createCustomFieldDef(DEF)).rejects.toThrow("denied");
  });
});

describe("setCustomFieldValue", () => {
  it("upserts on (field_def_id, entity_id), so setting twice updates in place", async () => {
    const supabase = mock();

    await setCustomFieldValue({ businessId: BUSINESS, fieldDefId: "def-1", entityId: "job-1", value: 42 });

    expect(opArgs(supabase.queries("custom_field_values")[0]!, "upsert")).toEqual([
      { business_id: BUSINESS, field_def_id: "def-1", entity_id: "job-1", value: 42 },
      { onConflict: "field_def_id,entity_id" },
    ]);
  });

  it.each([
    ["a string", "hello"],
    ["a boolean false", false],
    ["zero", 0],
    ["null", null],
    ["an object", { nested: true }],
    ["an array", [1, 2]],
  ])("stores %s verbatim rather than coercing it", async (_label, value) => {
    const supabase = mock();

    await setCustomFieldValue({ businessId: BUSINESS, fieldDefId: "def-1", entityId: "job-1", value });

    expect(opArgs(supabase.queries("custom_field_values")[0]!, "upsert")![0]).toMatchObject({ value });
  });

  it("propagates a failure", async () => {
    mock(null, new Error("denied"));
    await expect(
      setCustomFieldValue({ businessId: BUSINESS, fieldDefId: "d", entityId: "e", value: 1 }),
    ).rejects.toThrow("denied");
  });
});
