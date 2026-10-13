"use client";

import { Input } from "@cofounderai/core/ui/input";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@cofounderai/core/ui/collapsible";
import { ConsoleForm } from "../organizations/console-forms";
import { endAnnouncementAction } from "./actions";

// PLATFORM-P1-10.13: End now stops a notice at once and keeps its record.
export function EndAnnouncement({ id }: { id: string }) {
  return (
    <Collapsible>
      <CollapsibleTrigger className="text-xs text-zinc-300 underline-offset-2 hover:underline">End now</CollapsibleTrigger>
      <CollapsibleContent className="pt-2 text-left">
        <ConsoleForm action={endAnnouncementAction.bind(null, id)} submitLabel="End now">
          <Input name="reason" placeholder="Reason (required)" className="h-8 border-zinc-700 bg-zinc-950/60 text-zinc-50" />
        </ConsoleForm>
      </CollapsibleContent>
    </Collapsible>
  );
}
