"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Link2, Link2Off } from "lucide-react";
import { Button } from "@cofounderai/core/ui/button";

/**
 * B2's own "link this ticket to the thing it's about" control (docs/design/
 * crm-module-design.md Part B) -- rendered next to each order/job on the Customer 360
 * panel when it's reached from a ticket (?ticketId=). Toggling shows which one is
 * currently linked and lets the agent unlink or relink to a different item.
 */
export function RelatedDocumentButton({
  linked,
  onLink,
  onUnlink,
}: {
  linked: boolean;
  onLink: () => Promise<void>;
  onUnlink: () => Promise<void>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function run(fn: () => Promise<void>) {
    startTransition(async () => {
      await fn();
      router.refresh();
    });
  }

  return (
    <Button
      type="button"
      variant={linked ? "secondary" : "ghost"}
      size="sm"
      disabled={pending}
      onClick={() => run(linked ? onUnlink : onLink)}
      className="gap-1"
    >
      {linked ? <Link2Off className="size-3.5" aria-hidden="true" /> : <Link2 className="size-3.5" aria-hidden="true" />}
      {linked ? "Linked" : "Link to ticket"}
    </Button>
  );
}
