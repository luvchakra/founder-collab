import { describe, expect, it } from "vitest";
import { createAnnouncementSchema, isAnnouncementActive, updateAnnouncementSchema } from "./platform-announcements";

const validAllCustomers = {
  type: "information" as const,
  title: "New dashboard layout",
  message: "We've refreshed the dashboard layout -- nothing for you to do.",
  audienceType: "all_customers" as const,
  audiencePlanId: "",
  audienceCountryCode: "",
  publishAt: "",
  expireAt: "",
  maintenanceStart: "",
  maintenanceEnd: "",
  affectedModules: "",
  enabled: true,
  reason: "Publishing a routine information notice.",
};

describe("createAnnouncementSchema (PLATFORM-P0-15.1/15.2/15.3)", () => {
  it("accepts a valid all-customers information announcement", () => {
    expect(createAnnouncementSchema.safeParse(validAllCustomers).success).toBe(true);
  });

  it("requires a non-empty title and message", () => {
    expect(createAnnouncementSchema.safeParse({ ...validAllCustomers, title: "" }).success).toBe(false);
    expect(createAnnouncementSchema.safeParse({ ...validAllCustomers, message: "" }).success).toBe(false);
  });

  it("requires a non-empty reason", () => {
    expect(createAnnouncementSchema.safeParse({ ...validAllCustomers, reason: "" }).success).toBe(false);
    expect(createAnnouncementSchema.safeParse({ ...validAllCustomers, reason: "   " }).success).toBe(false);
  });

  it("requires a plan for audienceType=specific_plan", () => {
    expect(
      createAnnouncementSchema.safeParse({ ...validAllCustomers, audienceType: "specific_plan", audiencePlanId: "" })
        .success,
    ).toBe(false);
    expect(
      createAnnouncementSchema.safeParse({
        ...validAllCustomers,
        audienceType: "specific_plan",
        audiencePlanId: "some-plan-id",
      }).success,
    ).toBe(true);
  });

  it("requires a valid 2-letter country code for audienceType=specific_country", () => {
    expect(
      createAnnouncementSchema.safeParse({
        ...validAllCustomers,
        audienceType: "specific_country",
        audienceCountryCode: "",
      }).success,
    ).toBe(false);
    expect(
      createAnnouncementSchema.safeParse({
        ...validAllCustomers,
        audienceType: "specific_country",
        audienceCountryCode: "India",
      }).success,
    ).toBe(false);
    expect(
      createAnnouncementSchema.safeParse({
        ...validAllCustomers,
        audienceType: "specific_country",
        audienceCountryCode: "in",
      }).success,
    ).toBe(true);
  });

  it("rejects expireAt at or before publishAt", () => {
    const result = createAnnouncementSchema.safeParse({
      ...validAllCustomers,
      publishAt: "2026-01-01T00:00:00Z",
      expireAt: "2026-01-01T00:00:00Z",
    });
    expect(result.success).toBe(false);
  });

  it("accepts a valid publish/expire window and normalizes to ISO strings", () => {
    const result = createAnnouncementSchema.safeParse({
      ...validAllCustomers,
      publishAt: "2026-01-01T00:00:00Z",
      expireAt: "2026-02-01T00:00:00Z",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.publishAt).toBe("2026-01-01T00:00:00.000Z");
      expect(result.data.expireAt).toBe("2026-02-01T00:00:00.000Z");
    }
  });

  it("rejects a maintenance window or affected modules on a non-maintenance announcement", () => {
    expect(
      createAnnouncementSchema.safeParse({
        ...validAllCustomers,
        type: "information",
        maintenanceStart: "2026-01-01T00:00:00Z",
      }).success,
    ).toBe(false);
    expect(
      createAnnouncementSchema.safeParse({ ...validAllCustomers, type: "critical", affectedModules: "gst" }).success,
    ).toBe(false);
  });

  it("accepts a maintenance announcement with a window and affected modules", () => {
    const result = createAnnouncementSchema.safeParse({
      ...validAllCustomers,
      type: "maintenance",
      title: "Scheduled GST filing maintenance",
      message: "GST filing will be unavailable during the maintenance window.",
      maintenanceStart: "2026-03-01T02:00:00Z",
      maintenanceEnd: "2026-03-01T04:00:00Z",
      affectedModules: "gst, gst, inventory",
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.affectedModules).toEqual(["gst", "inventory"]);
  });

  it("rejects maintenanceEnd at or before maintenanceStart", () => {
    const result = createAnnouncementSchema.safeParse({
      ...validAllCustomers,
      type: "maintenance",
      maintenanceStart: "2026-03-01T04:00:00Z",
      maintenanceEnd: "2026-03-01T02:00:00Z",
    });
    expect(result.success).toBe(false);
  });

  it("rejects an unparsable date", () => {
    expect(createAnnouncementSchema.safeParse({ ...validAllCustomers, publishAt: "not-a-date" }).success).toBe(false);
  });
});

describe("updateAnnouncementSchema (PLATFORM-P0-15.1)", () => {
  const valid = {
    id: "11111111-1111-4111-8111-111111111111",
    type: "information" as const,
    title: "Updated notice",
    message: "Updated message body.",
    publishAt: "",
    expireAt: "",
    maintenanceStart: "",
    maintenanceEnd: "",
    affectedModules: "",
    enabled: false,
    reason: "Withdrawing early -- issue resolved.",
  };

  it("accepts a valid update", () => {
    expect(updateAnnouncementSchema.safeParse(valid).success).toBe(true);
  });

  it("requires a non-empty reason for every change, including disabling", () => {
    expect(updateAnnouncementSchema.safeParse({ ...valid, reason: "" }).success).toBe(false);
  });

  it("rejects an invalid id", () => {
    expect(updateAnnouncementSchema.safeParse({ ...valid, id: "not-a-uuid" }).success).toBe(false);
  });

  it("rejects expireAt at or before publishAt", () => {
    const result = updateAnnouncementSchema.safeParse({
      ...valid,
      publishAt: "2026-01-01T00:00:00Z",
      expireAt: "2025-01-01T00:00:00Z",
    });
    expect(result.success).toBe(false);
  });
});

describe("isAnnouncementActive (PLATFORM-P0-15.3)", () => {
  const now = new Date("2026-06-15T12:00:00Z");

  it("is false when disabled, regardless of the schedule", () => {
    expect(isAnnouncementActive({ enabled: false, publishAt: null, expireAt: null }, now)).toBe(false);
  });

  it("is true when enabled with no schedule at all", () => {
    expect(isAnnouncementActive({ enabled: true, publishAt: null, expireAt: null }, now)).toBe(true);
  });

  it("is false before publishAt", () => {
    expect(isAnnouncementActive({ enabled: true, publishAt: "2026-07-01T00:00:00Z", expireAt: null }, now)).toBe(
      false,
    );
  });

  it("is true at or after publishAt", () => {
    expect(isAnnouncementActive({ enabled: true, publishAt: "2026-06-01T00:00:00Z", expireAt: null }, now)).toBe(
      true,
    );
  });

  it("is false after expireAt", () => {
    expect(isAnnouncementActive({ enabled: true, publishAt: null, expireAt: "2026-06-01T00:00:00Z" }, now)).toBe(
      false,
    );
  });

  it("is true within a fully bounded window", () => {
    expect(
      isAnnouncementActive(
        { enabled: true, publishAt: "2026-06-01T00:00:00Z", expireAt: "2026-07-01T00:00:00Z" },
        now,
      ),
    ).toBe(true);
  });
});
