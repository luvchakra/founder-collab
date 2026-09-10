"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Sparkles } from "lucide-react";
import { Button } from "@cofounderai/core/ui/button";
import { Checkbox } from "@cofounderai/core/ui/checkbox";
import { toast } from "@cofounderai/core/ui/sonner";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@cofounderai/core/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@cofounderai/core/ui/table";
import type { DiscoveredProduct } from "../../lib/ai/schemas";
import type { ProductImportRow } from "../../lib/tenancy/parse-products-import";

/**
 * "Let AI Auto-populate Products from website" -- same two-step preview-then-confirm
 * shape as ProductImportWizard (that component's own doc comment explains why: nothing
 * is created until the founder reviews and confirms), just sourced from AI research
 * against the business's own website instead of an uploaded file. `discoverAction`
 * (step 1) only researches and returns a list, it never writes; `importAction` (step
 * 2, the same one the file-import wizard already uses) is what actually creates the
 * rows, called directly with the list already in state.
 */
export function AutoPopulateProductsButton({
  disabled,
  disabledReason,
  discoverAction,
  importAction,
}: {
  /** True when the business has no website configured yet -- there's nothing to
   * research against. */
  disabled: boolean;
  disabledReason?: string;
  discoverAction: () => Promise<{ products: DiscoveredProduct[] } | { error: string }>;
  importAction: (rows: ProductImportRow[]) => Promise<{ inserted: number; duplicates: number }>;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [discovering, startDiscovering] = useTransition();
  const [importing, startImporting] = useTransition();
  const [products, setProducts] = useState<DiscoveredProduct[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Every discovered row starts checked -- founders review and uncheck the ones they
  // don't want, rather than having to opt every row in individually.
  const [selected, setSelected] = useState<Set<number>>(new Set());

  function launch() {
    setOpen(true);
    setProducts(null);
    setError(null);
    startDiscovering(async () => {
      const result = await discoverAction();
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setProducts(result.products);
      setSelected(new Set(result.products.map((_, i) => i)));
    });
  }

  function close() {
    setOpen(false);
  }

  function toggleRow(i: number, checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(i);
      else next.delete(i);
      return next;
    });
  }

  function toggleAll(checked: boolean) {
    setSelected(checked ? new Set(products?.map((_, i) => i) ?? []) : new Set());
  }

  function confirmImport() {
    if (!products || selected.size === 0) return;
    const rows: ProductImportRow[] = products
      .filter((_, i) => selected.has(i))
      .map((p) => ({ name: p.name, website: p.website ?? undefined }));
    startImporting(async () => {
      const result = await importAction(rows);
      close();
      router.refresh();
      if (result.inserted === 0) {
        toast.error("No new products were added -- every one matched an existing product.");
        return;
      }
      toast.success(
        `Added ${result.inserted} product${result.inserted === 1 ? "" : "s"}.` +
          (result.duplicates > 0 ? ` Skipped ${result.duplicates} already in this business.` : ""),
      );
    });
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={launch} disabled={disabled} title={disabled ? disabledReason : undefined}>
        <Sparkles className="size-4" aria-hidden="true" />
        Let AI Auto-populate Products from website
      </Button>

      <Dialog open={open} onOpenChange={(next) => !next && close()}>
        <DialogContent className="flex max-h-[85vh] max-w-2xl flex-col overflow-hidden">
          <DialogHeader>
            <DialogTitle>AI-populated products</DialogTitle>
          </DialogHeader>

          {discovering ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Reading your website...</p>
          ) : error ? (
            <div className="flex flex-col gap-3">
              <p className="text-sm text-destructive">{error}</p>
              <DialogFooter>
                <Button type="button" variant="ghost" onClick={close}>
                  Close
                </Button>
              </DialogFooter>
            </div>
          ) : products ? (
            <div className="flex min-h-0 flex-1 flex-col gap-3">
              <p className="text-sm text-muted-foreground">
                Found <span className="font-medium text-foreground">{products.length}</span> product
                {products.length === 1 ? "" : "s"} on your website. Review and choose which to add.
              </p>
              <div className="min-h-0 flex-1 overflow-y-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10">
                        <Checkbox
                          checked={products.length > 0 && selected.size === products.length}
                          onCheckedChange={(checked) => toggleAll(checked === true)}
                          aria-label="Select all products"
                        />
                      </TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Website</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {products.map((p, i) => (
                      <TableRow key={i}>
                        <TableCell>
                          <Checkbox
                            checked={selected.has(i)}
                            onCheckedChange={(checked) => toggleRow(i, checked === true)}
                            aria-label={`Select ${p.name}`}
                          />
                        </TableCell>
                        <TableCell className="font-medium">{p.name}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {p.website ? (
                            <a
                              href={p.website}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="text-primary underline-offset-2 hover:underline"
                            >
                              {p.website}
                            </a>
                          ) : (
                            "—"
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <DialogFooter>
                <Button type="button" variant="ghost" onClick={close} disabled={importing}>
                  Cancel
                </Button>
                <Button onClick={confirmImport} disabled={importing || selected.size === 0}>
                  {importing
                    ? "Adding..."
                    : `Add ${selected.size} product${selected.size === 1 ? "" : "s"}`}
                </Button>
              </DialogFooter>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
