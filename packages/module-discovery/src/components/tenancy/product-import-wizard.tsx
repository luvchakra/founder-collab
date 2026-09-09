"use client";

import { useActionState, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Upload } from "lucide-react";
import { Button } from "@cofounderai/core/ui/button";
import { SubmitButton } from "@cofounderai/core/ui/submit-button";
import { toast } from "@cofounderai/core/ui/sonner";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@cofounderai/core/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@cofounderai/core/ui/table";
import type { ProductImportPreviewResult, ProductImportRow } from "../../lib/tenancy/parse-products-import";

const PREVIEW_ROW_COUNT = 5;

/**
 * The business page's "Import products" flow: upload a catalog file, review a preview
 * of what it parsed to before anything is created, then confirm. Two server round
 * trips, not one -- `previewAction` (step 1) only parses and returns rows, it never
 * writes; `importAction` (step 2) is what actually calls `createProductsBulk`, and it's
 * called directly with the rows this component already has in state rather than
 * re-uploading the file, since a `File` can't be resubmitted from React state the way a
 * plain array can.
 */
export function ProductImportWizard({
  previewAction,
  importAction,
}: {
  previewAction: (
    prevState: ProductImportPreviewResult | null,
    formData: FormData,
  ) => Promise<ProductImportPreviewResult>;
  importAction: (rows: ProductImportRow[]) => Promise<{ inserted: number; duplicates: number }>;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [previewState, formAction] = useActionState<ProductImportPreviewResult | null, FormData>(
    previewAction,
    null,
  );
  const [importing, startImporting] = useTransition();

  function close() {
    setOpen(false);
  }

  const hasPreview = previewState && !("error" in previewState);
  const rows = hasPreview ? previewState.rows : [];

  function confirmImport() {
    startImporting(async () => {
      const result = await importAction(rows);
      close();
      router.refresh();
      if (result.inserted === 0) {
        toast.error("No new products were added -- every row matched an existing product.");
        return;
      }
      toast.success(
        `Imported ${result.inserted} product${result.inserted === 1 ? "" : "s"}.` +
          (result.duplicates > 0 ? ` Skipped ${result.duplicates} already in this business.` : ""),
      );
    });
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Upload className="size-4" aria-hidden="true" />
        Import products
      </Button>

      <Dialog open={open} onOpenChange={(next) => !next && close()}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Import product catalog</DialogTitle>
          </DialogHeader>

          {!hasPreview ? (
            <form action={formAction} className="flex flex-col gap-3">
              <p className="text-sm text-muted-foreground">
                Preferred format: CSV or Excel (.xlsx) with columns{" "}
                <code className="rounded bg-muted px-1">name, description, website</code> --{" "}
                <code className="rounded bg-muted px-1">name</code> is the only required one. A
                different format (other column names, or a PDF catalog) is still analyzed on a
                best-effort basis -- review the preview carefully before importing.
              </p>
              <input
                type="file"
                name="file"
                required
                accept=".csv,text/csv,.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,.pdf,application/pdf"
                className="text-sm text-muted-foreground file:mr-3 file:rounded-md file:border file:bg-background file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-foreground hover:file:bg-accent"
              />
              {previewState && "error" in previewState ? (
                <p className="text-sm text-destructive">{previewState.error}</p>
              ) : null}
              <DialogFooter>
                <Button type="button" variant="ghost" onClick={close}>
                  Cancel
                </Button>
                <SubmitButton pendingText="Reading file...">Preview</SubmitButton>
              </DialogFooter>
            </form>
          ) : (
            <div className="flex flex-col gap-3">
              <p className="text-sm text-muted-foreground">
                Found <span className="font-medium text-foreground">{rows.length}</span> product
                {rows.length === 1 ? "" : "s"}
                {previewState.usedFallback
                  ? " -- this file didn't match the preferred template, so this is a best-effort read. "
                  : ". "}
                Showing the first {Math.min(PREVIEW_ROW_COUNT, rows.length)} below.
              </p>
              <div className="overflow-x-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>Website</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.slice(0, PREVIEW_ROW_COUNT).map((row, i) => (
                      <TableRow key={i}>
                        <TableCell className="font-medium">{row.name}</TableCell>
                        <TableCell className="max-w-xs truncate text-muted-foreground">
                          {row.description || "—"}
                        </TableCell>
                        <TableCell className="text-muted-foreground">{row.website || "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <DialogFooter>
                <Button type="button" variant="ghost" onClick={close} disabled={importing}>
                  Cancel
                </Button>
                <Button onClick={confirmImport} disabled={importing}>
                  {importing ? "Importing..." : `Import ${rows.length} product${rows.length === 1 ? "" : "s"}`}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
