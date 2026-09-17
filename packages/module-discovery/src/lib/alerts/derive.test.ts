/**
 * Alerts are derived, never persisted, so the only thing that can be wrong is this
 * function. The thresholds (80% info, 100% warning) and the stable `id` scheme matter
 * beyond cosmetics: read/unread state is tracked client-side keyed by that id, so an id
 * that changes between renders would silently un-read an alert.
 */
import { describe, expect, it } from "vitest";
import { deriveAccountAlerts, type Alert } from "./derive";
import { FREE_TIER_MONTHLY_COST_LIMIT_USD } from "../usage/limits";

const BUSINESS = { id: "biz-1" };
const PRODUCT = { id: "prod-1", name: "Widgets", product_profile: { summary: "x" } };
const WORKSPACE = { id: "ws-1" };

type Input = Parameters<typeof deriveAccountAlerts>[0];

// `product` overrides are loosely typed on purpose: the fixtures deliberately set fields
// to shapes the happy-path constant doesn't have (a null product_profile), which is the
// case under test.
function entry(overrides: { product?: Record<string, unknown> } = {}) {
  return {
    workspace: WORKSPACE,
    product: { ...PRODUCT, ...overrides.product },
    business: BUSINESS,
  } as unknown as Input["entries"][number];
}

function usage(totalCost: number) {
  return {
    "ws-1": { workspaceId: "ws-1", periodStart: "", periodEnd: "", totalRuns: 0, totalCost, byOperation: [] },
  } as unknown as Input["usageByWorkspace"];
}

function derive(input: Partial<Input>): Alert[] {
  return deriveAccountAlerts({
    entries: [entry()],
    usageByWorkspace: {} as Input["usageByWorkspace"],
    prospects: [],
    ...input,
  });
}

const CAP = FREE_TIER_MONTHLY_COST_LIMIT_USD;

describe("deriveAccountAlerts", () => {
  it("emits nothing for a healthy workspace", () => {
    expect(derive({})).toEqual([]);
  });

  it("stays quiet below the 80% credit threshold", () => {
    expect(derive({ usageByWorkspace: usage(CAP * 0.79) })).toEqual([]);
  });

  it("raises an info alert at 80% of credits, naming the percentage", () => {
    const alerts = derive({ usageByWorkspace: usage(CAP * 0.8) });

    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({ id: "usage-warn-ws-1", severity: "info" });
    expect(alerts[0]!.message).toContain("80%");
  });

  it("escalates to a warning at 100%, replacing the info alert rather than adding to it", () => {
    const alerts = derive({ usageByWorkspace: usage(CAP) });

    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({ id: "usage-limit-ws-1", severity: "warning" });
  });

  it("keeps the warning when spend overshoots the cap", () => {
    expect(derive({ usageByWorkspace: usage(CAP * 5) })[0]).toMatchObject({ severity: "warning" });
  });

  it("flags a product with no profile yet", () => {
    const alerts = derive({ entries: [entry({ product: { product_profile: null } })] });

    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({ id: "profile-prod-1", severity: "info" });
  });

  it("counts prospects needing a next action, and pluralizes correctly", () => {
    const one = derive({ prospects: [{ workspace_id: "ws-1", nextAction: "email" }] });
    expect(one[0]!.message).toContain("1 prospect needing");

    const two = derive({
      prospects: [
        { workspace_id: "ws-1", nextAction: "email" },
        { workspace_id: "ws-1", nextAction: "call" },
      ],
    });
    expect(two[0]!.message).toContain("2 prospects needing");
  });

  it("ignores prospects with no next action, and those in another workspace", () => {
    expect(
      derive({
        prospects: [
          { workspace_id: "ws-1", nextAction: null },
          { workspace_id: "ws-other", nextAction: "email" },
        ],
      }),
    ).toEqual([]);
  });

  it("links every alert into the right business/product path", () => {
    const alerts = derive({
      usageByWorkspace: usage(CAP),
      entries: [entry({ product: { product_profile: null } })],
      prospects: [{ workspace_id: "ws-1", nextAction: "email" }],
    });

    const base = "/dashboard/businesses/biz-1/products/prod-1";
    expect(alerts.map((a) => a.href).sort()).toEqual(
      [`${base}`, `${base}/prospects`, `${base}/usage`].sort(),
    );
  });

  it("sorts warnings ahead of info alerts", () => {
    const alerts = derive({
      usageByWorkspace: usage(CAP),
      entries: [entry({ product: { product_profile: null } })],
      prospects: [{ workspace_id: "ws-1", nextAction: "email" }],
    });

    expect(alerts[0]!.severity).toBe("warning");
    expect(alerts.slice(1).every((a) => a.severity === "info")).toBe(true);
  });

  it("lifts a later workspace's warning above an earlier one's info alert", () => {
    const second = {
      workspace: { id: "ws-2" },
      product: { id: "prod-2", name: "Gadgets", product_profile: { summary: "x" } },
      business: BUSINESS,
    } as unknown as Input["entries"][number];

    const alerts = deriveAccountAlerts({
      entries: [entry({ product: { product_profile: null } }), second],
      usageByWorkspace: {
        "ws-2": {
          workspaceId: "ws-2",
          periodStart: "",
          periodEnd: "",
          totalRuns: 0,
          totalCost: CAP,
          byOperation: [],
        },
      } as unknown as Input["usageByWorkspace"],
      prospects: [],
    });

    expect(alerts[0]!.severity).toBe("warning");
    expect(alerts[0]!.id).toBe("usage-limit-ws-2");
  });

  it("emits no usage alert for a workspace with no usage record at all", () => {
    expect(derive({ usageByWorkspace: {} as Input["usageByWorkspace"] })).toEqual([]);
  });
});
