/**
 * The rail's sections start folded, which only works because "never touched" and
 * "deliberately folded" are stored as different things -- a list of keys collapses the
 * two and silently turns the default inside out. These tests pin that distinction, the
 * "the section you're in stays open" exception, and the rule that a corrupt or
 * old-shaped stored value falls back to the defaults rather than throwing the rail away.
 */
import { describe, expect, it } from "vitest";
import {
  isNavGroupExpanded,
  navGroupKey,
  parseNavGroupFolds,
  toggleNavGroup,
} from "./nav-group-folds";

const CATALOG = navGroupKey("inventory", "Catalog & Inventory");

describe("isNavGroupExpanded", () => {
  it("folds a section nobody has touched", () => {
    expect(isNavGroupExpanded({}, CATALOG, false)).toBe(false);
  });

  it("opens the section holding the page you are on", () => {
    expect(isNavGroupExpanded({}, CATALOG, true)).toBe(true);
  });

  it("honours an explicit choice over either default", () => {
    expect(isNavGroupExpanded({ [CATALOG]: true }, CATALOG, false)).toBe(true);
    expect(isNavGroupExpanded({ [CATALOG]: false }, CATALOG, true)).toBe(false);
  });

  it("scopes a heading to its module, so two modules' Overview fold separately", () => {
    const folds = { [navGroupKey("inventory", "Overview")]: true };

    expect(isNavGroupExpanded(folds, navGroupKey("inventory", "Overview"), false)).toBe(true);
    expect(isNavGroupExpanded(folds, navGroupKey("fsm", "Overview"), false)).toBe(false);
  });
});

describe("toggleNavGroup", () => {
  it("opens a folded section and folds it again", () => {
    const opened = toggleNavGroup({}, CATALOG, false);
    expect(isNavGroupExpanded(opened, CATALOG, false)).toBe(true);

    const folded = toggleNavGroup(opened, CATALOG, false);
    expect(isNavGroupExpanded(folded, CATALOG, false)).toBe(false);
  });

  // The chevron on the section holding the current page reads "open", so one click has
  // to close it. Flipping the stored value instead of the shown one would store "open",
  // leave it open, and make the heading look broken.
  it("closes the section that was open only because it holds the current page", () => {
    const folded = toggleNavGroup({}, CATALOG, true);

    expect(isNavGroupExpanded(folded, CATALOG, true)).toBe(false);
  });

  it("does not mutate the folds it was given", () => {
    const folds = { [CATALOG]: true };

    toggleNavGroup(folds, CATALOG, false);

    expect(folds).toEqual({ [CATALOG]: true });
  });

  it("leaves every other section alone", () => {
    const other = navGroupKey("inventory", "Sales");

    expect(toggleNavGroup({ [other]: true }, CATALOG, false)).toEqual({
      [other]: true,
      [CATALOG]: true,
    });
  });
});

describe("parseNavGroupFolds", () => {
  it("keeps the booleans", () => {
    expect(parseNavGroupFolds({ [CATALOG]: true, other: false })).toEqual({
      [CATALOG]: true,
      other: false,
    });
  });

  // The key this replaced held a JSON array of collapsed headings. Reading one as a map
  // would be worse than ignoring it -- every entry would come back as a *truthy* value
  // under a numeric key, so nothing would match and nothing would break loudly either.
  it.each([
    ["the old collapsed-groups array", [CATALOG]],
    ["a bare string", "nope"],
    ["null", null],
    ["a number", 3],
  ])("ignores %s", (_label, value) => {
    expect(parseNavGroupFolds(value)).toEqual({});
  });

  it("drops entries that are not booleans rather than coercing them", () => {
    expect(parseNavGroupFolds({ [CATALOG]: "true", other: 1, real: false })).toEqual({
      real: false,
    });
  });
});
