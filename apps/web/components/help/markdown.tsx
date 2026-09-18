import { Fragment, type ReactNode } from "react";

/**
 * Renders the subset of Markdown the user guides are written in.
 *
 * A hand-written renderer rather than a library: the input is our own documentation, not
 * anything a user can supply, so the hard parts of a general Markdown parser (malicious
 * HTML, arbitrary nesting, reference links) are not in play — and adding a dependency for
 * something this bounded is exactly what the platform's engineering rules tell us not to
 * do. It handles what the guides actually use and nothing else: h3/h4 headings,
 * paragraphs, bullet and numbered lists with one level of nesting, blockquotes, tables,
 * fenced code, and inline bold, italic, code and links.
 *
 * Nothing here ever produces raw HTML — every node is a React element, so there is no
 * dangerouslySetInnerHTML anywhere in this path even though the content is trusted.
 */

type Block =
  | { kind: "heading"; level: 3 | 4; text: string }
  | { kind: "paragraph"; text: string }
  | { kind: "list"; ordered: boolean; items: ListItem[] }
  | { kind: "quote"; lines: string[] }
  | { kind: "code"; lines: string[] }
  | { kind: "table"; header: string[]; rows: string[][] };

type ListItem = { text: string; children: ListItem[] };

const BULLET = /^(\s*)[-*]\s+(.*)$/;
const ORDERED = /^(\s*)\d+[.)]\s+(.*)$/;

function splitRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

export function parseBlocks(markdown: string): Block[] {
  const lines = markdown.split("\n");
  const blocks: Block[] = [];
  let i = 0;

  const flushParagraph = (buffer: string[]) => {
    if (buffer.length > 0) blocks.push({ kind: "paragraph", text: buffer.join(" ").trim() });
    buffer.length = 0;
  };

  const paragraph: string[] = [];

  while (i < lines.length) {
    const line = lines[i];

    if (line.trim() === "") {
      flushParagraph(paragraph);
      i += 1;
      continue;
    }

    if (line.startsWith("```")) {
      flushParagraph(paragraph);
      const code: string[] = [];
      i += 1;
      while (i < lines.length && !lines[i].startsWith("```")) {
        code.push(lines[i]);
        i += 1;
      }
      i += 1; // closing fence
      blocks.push({ kind: "code", lines: code });
      continue;
    }

    if (line.startsWith("#### ") || line.startsWith("### ")) {
      flushParagraph(paragraph);
      const level = line.startsWith("#### ") ? 4 : 3;
      blocks.push({ kind: "heading", level, text: line.replace(/^#+\s+/, "") });
      i += 1;
      continue;
    }

    if (line.trimStart().startsWith("> ") || line.trim() === ">") {
      flushParagraph(paragraph);
      const quote: string[] = [];
      while (i < lines.length && (lines[i].trimStart().startsWith(">") || lines[i].trim() === "")) {
        if (lines[i].trim() === "") break;
        quote.push(lines[i].trimStart().replace(/^>\s?/, ""));
        i += 1;
      }
      blocks.push({ kind: "quote", lines: quote });
      continue;
    }

    // A table is a header row, a separator row of dashes, then body rows.
    if (line.trim().startsWith("|") && lines[i + 1]?.trim().startsWith("|") && /^[\s|:-]+$/.test(lines[i + 1])) {
      flushParagraph(paragraph);
      const header = splitRow(line);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && lines[i].trim().startsWith("|")) {
        rows.push(splitRow(lines[i]));
        i += 1;
      }
      blocks.push({ kind: "table", header, rows });
      continue;
    }

    const bullet = BULLET.exec(line);
    const ordered = ORDERED.exec(line);
    if (bullet || ordered) {
      flushParagraph(paragraph);
      const isOrdered = Boolean(ordered && !bullet);
      const items: ListItem[] = [];

      while (i < lines.length) {
        const current = lines[i];
        if (current.trim() === "") {
          // A blank line ends the list unless the next line continues it -- the guides use
          // blank lines between the items of a longer list.
          const next = lines[i + 1];
          if (next && (BULLET.test(next) || ORDERED.test(next) || /^\s{2,}\S/.test(next))) {
            i += 1;
            continue;
          }
          break;
        }

        const itemMatch = BULLET.exec(current) ?? ORDERED.exec(current);
        if (itemMatch) {
          const indent = itemMatch[1].length;
          const text = itemMatch[2];
          if (indent >= 2 && items.length > 0) {
            items[items.length - 1].children.push({ text, children: [] });
          } else {
            items.push({ text, children: [] });
          }
          i += 1;
          continue;
        }

        // An indented line that isn't a new item is the previous item wrapping.
        if (/^\s{2,}\S/.test(current) && items.length > 0) {
          const last = items[items.length - 1];
          const target = last.children.length > 0 ? last.children[last.children.length - 1] : last;
          target.text = `${target.text} ${current.trim()}`;
          i += 1;
          continue;
        }

        break;
      }

      blocks.push({ kind: "list", ordered: isOrdered, items });
      continue;
    }

    paragraph.push(line.trim());
    i += 1;
  }

  flushParagraph(paragraph);
  return blocks;
}

/** `**bold**`, `*italic*`, `` `code` `` and `[text](href)`, in one pass so a link's own
 * label can still carry bold or code. */
export function renderInline(text: string, keyPrefix = "i"): ReactNode[] {
  const pattern = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)]+\)|\*[^*\n]+\*)/g;
  const nodes: ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let n = 0;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) nodes.push(text.slice(lastIndex, match.index));
    const token = match[0];
    const key = `${keyPrefix}-${n++}`;

    if (token.startsWith("**")) {
      nodes.push(
        <strong key={key} className="font-semibold text-foreground">
          {renderInline(token.slice(2, -2), key)}
        </strong>,
      );
    } else if (token.startsWith("`")) {
      nodes.push(
        <code key={key} className="rounded bg-muted px-1 py-0.5 font-mono text-[0.85em] text-foreground">
          {token.slice(1, -1)}
        </code>,
      );
    } else if (token.startsWith("[")) {
      const [, label, href] = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(token) ?? [];
      const internal = href?.startsWith("/") || href?.startsWith("#");
      nodes.push(
        <a
          key={key}
          href={href}
          className="font-medium text-primary underline underline-offset-4 hover:text-primary/80"
          {...(internal ? {} : { target: "_blank", rel: "noreferrer noopener" })}
        >
          {renderInline(label ?? "", key)}
        </a>,
      );
    } else {
      nodes.push(
        <em key={key} className="italic">
          {token.slice(1, -1)}
        </em>,
      );
    }

    lastIndex = match.index + token.length;
  }

  if (lastIndex < text.length) nodes.push(text.slice(lastIndex));
  return nodes;
}

function List({ ordered, items, keyPrefix }: { ordered: boolean; items: ListItem[]; keyPrefix: string }) {
  const Tag = ordered ? "ol" : "ul";
  return (
    <Tag
      className={
        ordered
          ? "ml-5 flex list-decimal flex-col gap-1.5 marker:text-muted-foreground"
          : "ml-5 flex list-disc flex-col gap-1.5 marker:text-muted-foreground"
      }
    >
      {items.map((item, index) => (
        <li key={`${keyPrefix}-${index}`} className="pl-1">
          {renderInline(item.text, `${keyPrefix}-${index}`)}
          {item.children.length > 0 ? (
            <div className="mt-1.5">
              <List ordered={false} items={item.children} keyPrefix={`${keyPrefix}-${index}-c`} />
            </div>
          ) : null}
        </li>
      ))}
    </Tag>
  );
}

export function Markdown({ content }: { content: string }) {
  const blocks = parseBlocks(content);

  return (
    <div className="flex flex-col gap-4 text-sm leading-relaxed text-muted-foreground">
      {blocks.map((block, index) => {
        const key = `b-${index}`;
        switch (block.kind) {
          case "heading":
            return block.level === 3 ? (
              <h3 key={key} className="mt-2 text-base font-semibold text-foreground">
                {renderInline(block.text, key)}
              </h3>
            ) : (
              <h4 key={key} className="mt-1 text-sm font-semibold text-foreground">
                {renderInline(block.text, key)}
              </h4>
            );

          case "paragraph":
            return <p key={key}>{renderInline(block.text, key)}</p>;

          case "list":
            return <List key={key} ordered={block.ordered} items={block.items} keyPrefix={key} />;

          case "quote":
            return (
              <blockquote key={key} className="border-l-2 border-border pl-4 italic">
                {block.lines.map((line, lineIndex) => (
                  <Fragment key={`${key}-${lineIndex}`}>
                    {renderInline(line, `${key}-${lineIndex}`)}{" "}
                  </Fragment>
                ))}
              </blockquote>
            );

          case "code":
            return (
              <pre
                key={key}
                className="overflow-x-auto rounded-lg border border-border bg-muted/50 p-3 font-mono text-xs text-foreground"
              >
                <code>{block.lines.join("\n")}</code>
              </pre>
            );

          case "table":
            // Desktop keeps the table; a phone gets one labelled card per row, per the
            // platform-wide rule that no page ever shows a sideways-scrolling table.
            return (
              <div key={key}>
                <div className="hidden overflow-x-auto rounded-lg border border-border md:block">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-muted/50">
                      <tr>
                        {block.header.map((cell, cellIndex) => (
                          <th key={`${key}-h-${cellIndex}`} className="px-3 py-2 font-medium text-foreground">
                            {renderInline(cell, `${key}-h-${cellIndex}`)}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {block.rows.map((row, rowIndex) => (
                        <tr key={`${key}-r-${rowIndex}`}>
                          {row.map((cell, cellIndex) => (
                            <td key={`${key}-r-${rowIndex}-${cellIndex}`} className="px-3 py-2 align-top">
                              {renderInline(cell, `${key}-r-${rowIndex}-${cellIndex}`)}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="flex flex-col gap-2 md:hidden">
                  {block.rows.map((row, rowIndex) => (
                    <div key={`${key}-m-${rowIndex}`} className="rounded-lg border border-border p-3">
                      {row.map((cell, cellIndex) => (
                        <div key={`${key}-m-${rowIndex}-${cellIndex}`} className="flex flex-col gap-0.5 py-1">
                          <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                            {block.header[cellIndex]}
                          </span>
                          <span>{renderInline(cell, `${key}-m-${rowIndex}-${cellIndex}`)}</span>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            );
        }
      })}
    </div>
  );
}
