import { describe, expect, it } from "vitest";
import { assessItc, itcActions, type ItcInputs } from "./itc";

const base: ItcInputs = { ledger: 1000, register: 1000, twoB: 1000, twoBAvailable: true };

describe("what can actually be claimed", () => {
  it("claims the full amount when the books and 2B agree", () => {
    const a = assessItc(base);
    expect(a.claimable).toBe(1000);
    expect(a.risk).toBe("clear");
    expect(a.atRisk).toBe(0);
    expect(a.unclaimed).toBe(0);
  });

  // 2B is the ceiling: credit not in it is not claimable however good the paperwork,
  // because the supplier hasn't declared it.
  it("caps what is claimable at what 2B supports", () => {
    const a = assessItc({ ...base, ledger: 1500, register: 1500 });
    expect(a.claimable).toBe(1000);
    expect(a.atRisk).toBe(500);
    expect(a.risk).toBe("over_claimed");
  });

  it("never claims more than the books hold, even when 2B offers more", () => {
    const a = assessItc({ ...base, twoB: 1500 });
    expect(a.claimable).toBe(1000);
    expect(a.unclaimed).toBe(500);
    expect(a.risk).toBe("leaving_credit");
  });

  it("never reports a negative exposure or a negative shortfall", () => {
    for (const ledger of [0, 500, 1000, 5000]) {
      const a = assessItc({ ...base, ledger, register: ledger });
      expect(a.atRisk, `ledger ${ledger}`).toBeGreaterThanOrEqual(0);
      expect(a.unclaimed, `ledger ${ledger}`).toBeGreaterThanOrEqual(0);
    }
  });

  it("cannot both over-claim and leave credit behind", () => {
    for (const ledger of [0, 999, 1000, 1001, 9999]) {
      const a = assessItc({ ...base, ledger, register: ledger });
      expect(a.atRisk > 0 && a.unclaimed > 0, `ledger ${ledger}`).toBe(false);
    }
  });

  it("does not call a paisa of floating point an exposure", () => {
    const a = assessItc({ ledger: 0.1 + 0.2, register: 0.3, twoB: 0.3, twoBAvailable: true });
    expect(a.risk).toBe("clear");
    expect(a.atRisk).toBe(0);
  });
});

describe("when no 2B has been imported", () => {
  const a = assessItc({ ...base, twoBAvailable: false, twoB: 0 });

  // Without a ceiling, calling anything "claimable" would be a fabrication.
  it("does not pretend to know what is claimable", () => {
    expect(a.risk).toBe("unknown");
    expect(a.headline).toMatch(/no gstr-2b/i);
  });

  it("still reports what the books hold, which is honest", () => {
    expect(a.claimable).toBe(1000);
  });

  it("invents neither an exposure nor a shortfall from a missing 2B", () => {
    expect(a.atRisk).toBe(0);
    expect(a.unclaimed).toBe(0);
  });

  it("asks for the 2B first, since everything else depends on it", () => {
    expect(itcActions(a)).toHaveLength(1);
    expect(itcActions(a)[0]).toMatch(/import/i);
  });
});

describe("the books disagreeing with themselves", () => {
  // A ledger/register gap is a posting problem, not a 2B problem, and mixing the two
  // sends people looking in the wrong place.
  it("is reported separately from anything 2B says", () => {
    const a = assessItc({ ledger: 1000, register: 1200, twoB: 1000, twoBAvailable: true });
    expect(a.booksAgree).toBe(false);
    expect(a.risk).toBe("clear");
    expect(itcActions(a).join(" ")).toMatch(/posting problem/i);
  });

  it("says nothing about posting when the two do agree", () => {
    expect(itcActions(assessItc(base)).join(" ")).not.toMatch(/posting problem/i);
  });
});

describe("suppliers with no GSTIN", () => {
  // 2B is built only from registered suppliers' filings, so these were never eligible —
  // counting them as missing would invent an exposure.
  it("are reported, never treated as missing credit", () => {
    const a = assessItc({ ...base, excludedNoGstin: 400 });
    expect(a.excludedNoGstin).toBe(400);
    expect(a.atRisk).toBe(0);
    expect(a.risk).toBe("clear");
  });

  it("are called out so real spend is not silently dropped from view", () => {
    expect(itcActions(assessItc({ ...base, excludedNoGstin: 400 })).join(" ")).toMatch(/no GSTIN/i);
  });
});

describe("what to do next", () => {
  // One costs interest and a notice, the other costs only the credit itself.
  it("leads with the filing risk when credit is over-claimed", () => {
    const actions = itcActions(assessItc({ ...base, ledger: 1500, register: 1500 }));
    expect(actions[0]).toMatch(/missing in 2b|haven't filed/i);
  });

  it("points at unentered bills when credit is being left behind", () => {
    expect(itcActions(assessItc({ ...base, twoB: 1500 })).join(" ")).toMatch(/never entered/i);
  });

  it("has nothing to say when everything lines up", () => {
    expect(itcActions(assessItc(base))).toEqual([]);
  });

  it("names the amount in the headline, so the number is not only in a table", () => {
    expect(assessItc({ ...base, ledger: 1500, register: 1500 }).headline).toContain("500");
  });
});
