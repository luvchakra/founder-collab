"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { usePathname } from "next/navigation";
import { MessageCircle, Send, X } from "lucide-react";
import { useDismiss } from "@cofounderai/core/hooks/use-dismiss";
import { Button } from "@cofounderai/core/ui/button";
import { Input } from "@cofounderai/core/ui/input";
import { getActiveIdsFromPath } from "../../lib/tenancy/active-path";
import { getChatPanelDataAction, sendChatMessageAction } from "../../actions/chat";
import type { ChatMessage } from "../../lib/ai/chat";
import { ChatMarkdown } from "./chat-markdown";

/**
 * Header AI assistant: a message-icon trigger that opens a slide-over chat panel, same
 * dismiss pattern (outside click / Escape) as the sidebar and account menus. Grounded in
 * whichever business/product the URL currently points at (lib/tenancy/active-path.ts).
 * History is persisted per product (lib/chat/queries.ts, keyed by the product's
 * workspace) -- switching to a different product's pages loads that product's own saved
 * conversation instead of carrying over whatever was in view before.
 */
export function AiChatWidget() {
  const pathname = usePathname();
  const context = getActiveIdsFromPath(pathname ?? "");
  const threadKey = context.productId ?? context.businessId ?? "__account__";

  const [open, setOpen] = useState(false);
  const [showBackToChat, setShowBackToChat] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [followUp, setFollowUp] = useState<string | null>(null);
  const [starterQuestions, setStarterQuestions] = useState<string[]>([]);
  const [loadedThreadKey, setLoadedThreadKey] = useState<string | null>(null);
  const [renderedThreadKey, setRenderedThreadKey] = useState(threadKey);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  useDismiss(panelRef, open, () => setOpen(false));

  // Clears the previous thread's content the instant the header's business/product
  // selection changes -- during render, not in an effect, so the panel can never paint a
  // frame showing one business/product's conversation while the header says another is
  // selected. This is React's documented "adjust state while rendering" pattern for
  // resetting state on a prop-like change (here, the URL-derived threadKey), distinct
  // from loadedThreadKey below, which the effect uses to know whether it still needs to
  // fetch this thread's data -- render-time clearing must never mark it as fetched.
  if (threadKey !== renderedThreadKey) {
    setRenderedThreadKey(threadKey);
    setMessages([]);
    setFollowUp(null);
    setStarterQuestions([]);
    setError(null);
  }

  useEffect(() => {
    if (!open || loadedThreadKey === threadKey) return;
    let cancelled = false;
    getChatPanelDataAction(context).then((data) => {
      if (cancelled) return;
      setLoadedThreadKey(threadKey);
      if (data.messages.length > 0) {
        setMessages(data.messages);
        setFollowUp(data.followUp);
      } else {
        setStarterQuestions(data.starterQuestions);
      }
    });
    return () => {
      cancelled = true;
    };
    // Fetches once per product/business the panel is opened against (threadKey), and
    // again if the founder navigates to a different one while the panel stays open --
    // not on every pathname change within the same product.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, threadKey]);

  const loadingThread = open && loadedThreadKey !== threadKey;

  async function send(text: string) {
    if (!text.trim() || pending) return;

    const next = [...messages, { role: "user", content: text.trim() } satisfies ChatMessage];
    setMessages(next);
    setInput("");
    setFollowUp(null);
    setError(null);
    setPending(true);

    const result = await sendChatMessageAction(next, context);
    setPending(false);

    if ("error" in result) {
      setError(result.error);
      return;
    }
    setMessages([...next, { role: "assistant", content: result.answer }]);
    setFollowUp(result.followUp);
  }

  function handleSend(e: FormEvent) {
    e.preventDefault();
    send(input);
  }

  /** Clicking a portal link inside a chat answer navigates there via next/link -- closing
   * the panel first so the destination page isn't hidden behind it. The conversation isn't
   * lost: this component lives in the persistent dashboard layout and doesn't unmount on
   * navigation, so the "Back to chat" button just reopens the same history. */
  function handleInternalLinkClick() {
    setOpen(false);
    setShowBackToChat(true);
  }

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={() => {
          setOpen((v) => !v);
          setShowBackToChat(false);
        }}
        aria-label="Ask the AI assistant"
        aria-expanded={open}
        className="shrink-0"
      >
        <MessageCircle className="size-5" aria-hidden="true" />
      </Button>

      {!open && showBackToChat ? (
        <button
          type="button"
          onClick={() => {
            setOpen(true);
            setShowBackToChat(false);
          }}
          className="fixed right-6 bottom-6 z-40 flex items-center gap-2 rounded-full border bg-background px-4 py-2.5 text-sm font-medium shadow-lg transition-colors hover:bg-accent"
        >
          <MessageCircle className="size-4 text-primary" aria-hidden="true" />
          Back to chat
        </button>
      ) : null}

      {open ? (
        <>
          <div
            className="fixed inset-0 top-14 z-30 bg-black/50"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />
          <div
            ref={panelRef}
            role="dialog"
            aria-label="AI assistant"
            className="fixed top-14 right-0 bottom-0 z-40 flex w-full max-w-sm flex-col border-l bg-background shadow-2xl sm:w-96"
          >
            <div className="flex items-center justify-between border-b px-4 py-3">
              <div className="flex items-center gap-2">
                <MessageCircle className="size-4 text-primary" aria-hidden="true" />
                <span className="font-medium">AI Assistant</span>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close AI assistant"
                className="text-muted-foreground transition-colors hover:text-foreground"
              >
                <X className="size-4" aria-hidden="true" />
              </button>
            </div>

            <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-4">
              {loadingThread ? (
                <p className="text-sm text-muted-foreground">Loading conversation...</p>
              ) : messages.length === 0 ? (
                <div className="flex flex-col gap-3">
                  <p className="text-sm text-muted-foreground">
                    Ask about GTM strategy, your ICP, prospects, or how to use
                    co-founder-ai.
                  </p>
                  {starterQuestions.length > 0 ? (
                    <div className="flex flex-col gap-1.5">
                      {starterQuestions.map((q) => (
                        <button
                          key={q}
                          type="button"
                          onClick={() => setInput(q)}
                          className="rounded-md border px-3 py-2 text-left text-sm text-muted-foreground transition-colors hover:border-primary hover:text-foreground"
                        >
                          {q}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : (
                messages.map((m, i) => (
                  <div
                    key={i}
                    className={
                      m.role === "user"
                        ? "ml-auto max-w-[85%] rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground"
                        : "mr-auto max-w-[90%] rounded-md bg-muted px-3 py-2 text-sm"
                    }
                  >
                    {m.role === "assistant" ? (
                      <ChatMarkdown text={m.content} onInternalLinkClick={handleInternalLinkClick} />
                    ) : (
                      <p className="whitespace-pre-wrap">{m.content}</p>
                    )}
                  </div>
                ))
              )}
              {pending ? <p className="text-xs text-muted-foreground">Thinking...</p> : null}
              {error ? (
                <p role="alert" className="text-xs text-destructive">
                  {error}
                </p>
              ) : null}
              {!pending && followUp ? (
                <button
                  type="button"
                  onClick={() => setInput(followUp)}
                  className="mr-auto max-w-[90%] rounded-md border border-dashed px-3 py-2 text-left text-sm text-muted-foreground transition-colors hover:border-primary hover:text-foreground"
                >
                  {followUp}
                </button>
              ) : null}
            </div>

            <form onSubmit={handleSend} className="flex items-center gap-2 border-t p-3">
              <Input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask a question..."
                aria-label="Message"
              />
              <Button type="submit" size="icon" disabled={pending || !input.trim()} aria-label="Send">
                <Send className="size-4" aria-hidden="true" />
              </Button>
            </form>
          </div>
        </>
      ) : null}
    </>
  );
}
