import { describe, expect, it } from "vitest";
import {
  SUB_SUPPLY_TYPE_CATALOG,
  TRANSACTION_TYPE_CATALOG,
  TRANSPORT_MODE_CATALOG,
  VEHICLE_TYPE_CATALOG,
  subSupplyTypes,
  transactionTypes,
  transportModes,
  vehicleTypes,
} from "./catalog";

function expectNoDuplicateCodes(catalog: { code: string }[]) {
  const codes = catalog.map((entry) => entry.code);
  expect(new Set(codes).size).toBe(codes.length);
}

function expectEveryEntryHasLabelAndDescription(catalog: { label: string; description: string }[]) {
  for (const entry of catalog) {
    expect(entry.label.trim().length).toBeGreaterThan(0);
    expect(entry.description.trim().length).toBeGreaterThan(0);
  }
}

describe("TRANSACTION_TYPE_CATALOG", () => {
  it("has exactly the 4 NIC-documented transaction types", () => {
    expect(TRANSACTION_TYPE_CATALOG).toHaveLength(4);
    expect(TRANSACTION_TYPE_CATALOG.map((e) => e.code)).toEqual([
      "regular",
      "bill_to_ship_to",
      "bill_from_dispatch_from",
      "combination_bill_to_ship_to_and_bill_from_dispatch_from",
    ]);
  });

  it("has no duplicate codes and every entry has a label/description", () => {
    expectNoDuplicateCodes(TRANSACTION_TYPE_CATALOG);
    expectEveryEntryHasLabelAndDescription(TRANSACTION_TYPE_CATALOG);
  });
});

describe("SUB_SUPPLY_TYPE_CATALOG", () => {
  it("has exactly the 9 documented outward sub-supply types", () => {
    expect(SUB_SUPPLY_TYPE_CATALOG).toHaveLength(9);
  });

  it("has no duplicate codes and every entry has a label/description", () => {
    expectNoDuplicateCodes(SUB_SUPPLY_TYPE_CATALOG);
    expectEveryEntryHasLabelAndDescription(SUB_SUPPLY_TYPE_CATALOG);
  });
});

describe("TRANSPORT_MODE_CATALOG / VEHICLE_TYPE_CATALOG", () => {
  it("has the 4 transport modes and 2 vehicle types with no duplicates", () => {
    expect(TRANSPORT_MODE_CATALOG.map((e) => e.code)).toEqual(["road", "rail", "air", "ship"]);
    expect(VEHICLE_TYPE_CATALOG.map((e) => e.code)).toEqual(["regular", "over_dimensional_cargo"]);
    expectNoDuplicateCodes(TRANSPORT_MODE_CATALOG);
    expectNoDuplicateCodes(VEHICLE_TYPE_CATALOG);
  });
});

describe("lookups", () => {
  it("transactionTypes.isSupported/get hit and miss", () => {
    expect(transactionTypes.isSupported("regular")).toBe(true);
    expect(transactionTypes.isSupported("not_a_type")).toBe(false);
    expect(transactionTypes.get("bill_to_ship_to")?.label).toBe("Bill To - Ship To");
    expect(transactionTypes.get("not_a_type")).toBeUndefined();
  });

  it("subSupplyTypes.isSupported/get hit and miss", () => {
    expect(subSupplyTypes.isSupported("job_work")).toBe(true);
    expect(subSupplyTypes.isSupported("purchase")).toBe(false);
    expect(subSupplyTypes.get("export")?.code).toBe("export");
  });

  it("transportModes/vehicleTypes.isSupported hit and miss", () => {
    expect(transportModes.isSupported("road")).toBe(true);
    expect(transportModes.isSupported("sea")).toBe(false);
    expect(vehicleTypes.isSupported("over_dimensional_cargo")).toBe(true);
    expect(vehicleTypes.isSupported("oversized")).toBe(false);
  });
});
