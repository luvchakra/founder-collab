"use client";

import { useState } from "react";
import Link from "next/link";
import { Plus, Sparkles, Upload } from "lucide-react";
import { Button } from "@cofounderai/core/ui/button";
import { AddProspectModal } from "./add-prospect-modal";

export function ProspectToolbarActions({
  importHref,
  discoverHref,
  createAction,
}: {
  importHref: string;
  discoverHref: string;
  createAction: (formData: FormData) => Promise<void>;
}) {
  const [addOpen, setAddOpen] = useState(false);

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <Button asChild variant="outline" size="sm">
        <Link href={importHref}>
          <Upload className="size-4" aria-hidden="true" />
          Import CSV
        </Link>
      </Button>
      <Button asChild variant="outline" size="sm">
        <Link href={discoverHref}>
          <Sparkles className="size-4" aria-hidden="true" />
          Discover
        </Link>
      </Button>
      <Button size="sm" className="px-2.5" onClick={() => setAddOpen(true)}>
        <Plus className="size-4" aria-hidden="true" />
        Add
      </Button>

      {addOpen ? (
        <AddProspectModal action={createAction} onClose={() => setAddOpen(false)} />
      ) : null}
    </div>
  );
}
