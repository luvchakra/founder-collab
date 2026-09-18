import { describe, expect, it } from "vitest";
import { parseBlocks } from "./markdown";

/**
 * The block parser is the part with real logic in it; the rendering around it is markup.
 * Every case here is a shape that actually appears in docs/user-guides — if the guides
 * grow a construct this doesn't handle, the failure shows up as prose with stray
 * asterisks on a help page, which nothing else would catch.
 */
describe("parseBlocks", () => {
  it("joins a wrapped paragraph back into one", () => {
    const blocks = parseBlocks("Finance is your books: a real\ndouble-entry ledger.");
    expect(blocks).toEqual([{ kind: "paragraph", text: "Finance is your books: a real double-entry ledger." }]);
  });

  it("reads h3 and h4 headings", () => {
    expect(parseBlocks("### Step 1\n#### Detail")).toEqual([
      { kind: "heading", level: 3, text: "Step 1" },
      { kind: "heading", level: 4, text: "Detail" },
    ]);
  });

  it("reads a bullet list, including an item that wraps across lines", () => {
    const blocks = parseBlocks("- **Open** — entries can be added\n  and reversed freely.\n- **Closed** — no new entries.");
    expect(blocks).toHaveLength(1);
    const list = blocks[0];
    expect(list.kind).toBe("list");
    if (list.kind !== "list") return;
    expect(list.ordered).toBe(false);
    expect(list.items.map((item) => item.text)).toEqual([
      "**Open** — entries can be added and reversed freely.",
      "**Closed** — no new entries.",
    ]);
  });

  it("reads a numbered list", () => {
    const blocks = parseBlocks("1. Warehouses\n2. Suppliers");
    expect(blocks[0].kind).toBe("list");
    if (blocks[0].kind !== "list") return;
    expect(blocks[0].ordered).toBe(true);
    expect(blocks[0].items).toHaveLength(2);
  });

  it("nests an indented bullet under the item above it", () => {
    const blocks = parseBlocks("- Suppliers\n  - Stage this feed\n- Products");
    expect(blocks[0].kind).toBe("list");
    if (blocks[0].kind !== "list") return;
    expect(blocks[0].items).toHaveLength(2);
    expect(blocks[0].items[0].children.map((c) => c.text)).toEqual(["Stage this feed"]);
  });

  it("keeps a list together across the blank lines between its items", () => {
    const blocks = parseBlocks("- First item\n\n- Second item\n\nA following paragraph.");
    expect(blocks).toHaveLength(2);
    expect(blocks[0].kind).toBe("list");
    if (blocks[0].kind !== "list") return;
    expect(blocks[0].items).toHaveLength(2);
    expect(blocks[1]).toEqual({ kind: "paragraph", text: "A following paragraph." });
  });

  it("reads a table's header and rows", () => {
    const blocks = parseBlocks("| You see | URL | Key |\n|---|---|---|\n| Finance | `/finance` | `gst` |");
    expect(blocks[0]).toEqual({
      kind: "table",
      header: ["You see", "URL", "Key"],
      rows: [["Finance", "`/finance`", "`gst`"]],
    });
  });

  it("reads a fenced code block verbatim, indentation and all", () => {
    const blocks = parseBlocks("```\ncurl -s \\\n  https://example.com\n```");
    expect(blocks[0]).toEqual({ kind: "code", lines: ["curl -s \\", "  https://example.com"] });
  });

  // A pipe table needs its dashes row; a line that merely starts with "|" does not become
  // a table, or a sentence beginning with a pipe would silently eat the lines after it.
  it("does not treat a stray pipe line as a table", () => {
    const blocks = parseBlocks("| not a table\nstill prose");
    expect(blocks[0].kind).toBe("paragraph");
  });

  it("reads a blockquote", () => {
    const blocks = parseBlocks("> Some labels are leftover\n> India-GST wording.");
    expect(blocks[0]).toEqual({ kind: "quote", lines: ["Some labels are leftover", "India-GST wording."] });
  });

  it("handles a realistic section with several block types in a row", () => {
    const source = [
      "Periods are how a set of books gets closed.",
      "",
      "- **Open** — entries can be added.",
      "- **Closed** — no new entries.",
      "",
      "### Correcting a mistake",
      "",
      "Correction is by reversal.",
    ].join("\n");
    expect(parseBlocks(source).map((block) => block.kind)).toEqual([
      "paragraph",
      "list",
      "heading",
      "paragraph",
    ]);
  });
});
