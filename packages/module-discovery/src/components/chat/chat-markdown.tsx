import Link from "next/link";
import type { ReactNode } from "react";

/** Matches **bold** or [label](url), in order, so plain text between matches passes
 * through untouched. */
const INLINE_PATTERN = /\*\*(.+?)\*\*|\[([^\]]+)\]\(([^)\s]+)\)/g;

function renderInline(text: string, onInternalLinkClick?: () => void): ReactNode[] {
  const nodes: ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  INLINE_PATTERN.lastIndex = 0;
  while ((match = INLINE_PATTERN.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }

    const [, bold, linkLabel, linkUrl] = match;
    if (bold !== undefined) {
      nodes.push(<strong key={key++}>{bold}</strong>);
    } else if (linkUrl!.startsWith("/")) {
      nodes.push(
        <Link
          key={key++}
          href={linkUrl!}
          onClick={onInternalLinkClick}
          className="underline underline-offset-2 hover:text-primary"
        >
          {linkLabel}
        </Link>,
      );
    } else {
      nodes.push(
        <a
          key={key++}
          href={linkUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="underline underline-offset-2 hover:text-primary"
        >
          {linkLabel}
        </a>,
      );
    }

    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  return nodes;
}

/** Markdown-lite for chat answers -- **bold** and [text](url) links (internal portal
 * paths via next/link, external sources as a new tab), split into paragraphs on blank
 * lines. No markdown dependency: the model's output is deliberately constrained to this
 * small subset (see prompts/chat/chat_v1.ts), so a full parser would be overkill.
 *
 * `onInternalLinkClick` fires only for internal (`/`-prefixed) links -- the widget uses it
 * to close the chat panel so the destination page isn't obscured, then shows a "Back to
 * chat" affordance to return to this same conversation. */
export function ChatMarkdown({
  text,
  onInternalLinkClick,
}: {
  text: string;
  onInternalLinkClick?: () => void;
}) {
  const paragraphs = text.split(/\n{2,}/).filter((p) => p.trim().length > 0);

  return (
    <div className="flex flex-col gap-2">
      {paragraphs.map((paragraph, i) => (
        <p key={i} className="whitespace-pre-wrap">
          {renderInline(paragraph, onInternalLinkClick)}
        </p>
      ))}
    </div>
  );
}
