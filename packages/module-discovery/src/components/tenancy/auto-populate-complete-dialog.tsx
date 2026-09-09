"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { PartyPopper } from "lucide-react";
import { Button } from "@cofounderai/core/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@cofounderai/core/ui/dialog";
import { fireConfetti } from "./confetti";

/**
 * The terminal celebration for the Overview -> ICP -> Prospects auto-populate flow
 * (see AutoPopulateStepBanner) -- rendered on the Prospects page once the last step's
 * own navigation carries `?autopopulated=<count>`. Fires the confetti burst exactly
 * once per landing (a ref guard, since `resultCount` is a stable prop for the whole
 * time this dialog is open) and shows the same guidance regardless of count: the
 * founder should review Overview/ICP/Prospects and re-run Discover themselves if this
 * one auto-found prospect isn't a good match, rather than auto-populate silently trying
 * again on their behalf.
 */
export function AutoPopulateCompleteDialog({
  resultCount,
  basePath,
}: {
  resultCount?: string;
  basePath: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(Boolean(resultCount));
  const firedRef = useRef(false);

  useEffect(() => {
    if (!resultCount || firedRef.current) return;
    firedRef.current = true;
    setOpen(true);
    return fireConfetti();
  }, [resultCount]);

  if (!resultCount) return null;

  function close() {
    setOpen(false);
    router.replace(basePath);
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && close()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PartyPopper className="size-5 text-primary" aria-hidden="true" />
            {resultCount === "0"
              ? "Auto-populate finished"
              : `Found ${resultCount} prospect${resultCount === "1" ? "" : "s"}!`}
          </DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          If you are not satisfied with the search results, please review Overview, ICP,
          Prospects pages to update information and perform Discover action under Prospects
          again.
        </p>
        <DialogFooter>
          <Button onClick={close}>Got it</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
