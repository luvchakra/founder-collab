"use client";

import { useMemo, useState, useTransition } from "react";
import { Printer, QrCode } from "lucide-react";
import { Button } from "@cofounderai/core/ui/button";
import { Input } from "@cofounderai/core/ui/input";
import { Checkbox } from "@cofounderai/core/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@cofounderai/core/ui/dialog";
import { NativeSelect } from "@cofounderai/core/ui/native-select";
import { BarcodeImage, BARCODE_FORMATS, type BarcodeFormat } from "./barcode-image";

type LabelProduct = { id: string; sku: string | null; name: string; barcode: string | null };

/** Products encode their SKU by default, and reuse an existing barcode value rather
 * than overwriting it, so re-printing a label never changes a code that's already out
 * on a shelf or box somewhere -- matches `generateBarcodesForProducts`'s own rule. A
 * missing SKU (the products form requires one, but the column itself is nullable) falls
 * back to the product id so there's always something to encode. */
function encodedValueFor(p: LabelProduct) {
  return p.barcode || p.sku || p.id;
}

export function BarcodeLabelDialog({
  open,
  onOpenChange,
  products,
  generateAction,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  products: LabelProduct[];
  generateAction: (productIds: string[]) => Promise<void>;
}) {
  const [step, setStep] = useState<"select" | "preview">("select");
  const [search, setSearch] = useState("");
  const [format, setFormat] = useState<BarcodeFormat>("code128");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [pending, startTransition] = useTransition();

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return products;
    return products.filter(
      (p) => (p.sku ?? "").toLowerCase().includes(q) || p.name.toLowerCase().includes(q),
    );
  }, [products, search]);

  const selected = products.filter((p) => selectedIds.has(p.id));

  const toggle = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const generate = () => {
    startTransition(async () => {
      await generateAction(selected.map((p) => p.id));
      setStep("preview");
    });
  };

  const close = (next: boolean) => {
    onOpenChange(next);
    if (!next) {
      setStep("select");
      setSearch("");
      setSelectedIds(new Set());
    }
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        {step === "select" ? (
          <>
            <DialogHeader>
              <DialogTitle>Generate barcode / QR labels</DialogTitle>
            </DialogHeader>
            <div className="flex flex-col gap-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium">Format</label>
                  <NativeSelect value={format} onChange={(e) => setFormat(e.target.value as BarcodeFormat)}>
                    {BARCODE_FORMATS.map((f) => (
                      <option key={f.value} value={f.value}>
                        {f.label}
                      </option>
                    ))}
                  </NativeSelect>
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium">Search products</label>
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search by SKU or name..."
                  />
                </div>
              </div>

              <div className="max-h-72 overflow-y-auto rounded-md border">
                {filtered.map((p) => (
                  <label
                    key={p.id}
                    className="flex cursor-pointer items-center gap-3 border-b px-3 py-2 text-sm last:border-b-0 hover:bg-accent/40"
                  >
                    <Checkbox checked={selectedIds.has(p.id)} onCheckedChange={() => toggle(p.id)} />
                    <span className="min-w-0 flex-1 truncate">{p.name}</span>
                    <span className="shrink-0 font-mono text-xs text-muted-foreground">{p.sku ?? "—"}</span>
                  </label>
                ))}
                {filtered.length === 0 ? (
                  <p className="p-4 text-center text-sm text-muted-foreground">
                    No products match &quot;{search}&quot;.
                  </p>
                ) : null}
              </div>

              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  {selected.length} product{selected.length === 1 ? "" : "s"} selected
                </p>
                <Button onClick={generate} disabled={selected.length === 0 || pending}>
                  <QrCode className="size-4" aria-hidden="true" />
                  {pending ? "Generating..." : "Generate & preview"}
                </Button>
              </div>
            </div>
          </>
        ) : (
          <>
            <DialogHeader className="no-print">
              <DialogTitle>{selected.length} label(s) ready to print</DialogTitle>
            </DialogHeader>
            <div className="no-print mb-4 flex items-center justify-between">
              <Button variant="outline" onClick={() => setStep("select")}>
                Back
              </Button>
              <Button onClick={() => window.print()}>
                <Printer className="size-4" aria-hidden="true" />
                Print
              </Button>
            </div>
            <div className="print-area label-sheet flex flex-wrap gap-3">
              {selected.map((p) => (
                <div
                  key={p.id}
                  className="label-card flex flex-col items-center justify-center gap-1 rounded-md border p-2 text-center"
                >
                  <BarcodeImage value={encodedValueFor(p)} format={format} size={64} />
                  <p className="truncate text-[10px] font-medium">{p.name}</p>
                </div>
              ))}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
