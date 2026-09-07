"use client";

import { useState } from "react";
import { Package, Pencil, Plus } from "lucide-react";
import { Button } from "@cofounderai/core/ui/button";
import { Badge } from "@cofounderai/core/ui/badge";
import { SubmitButton } from "@cofounderai/core/ui/submit-button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@cofounderai/core/ui/table";
import { inr } from "@cofounderai/core/lib/format";
import { ProductModal, type ProductActionState } from "./product-modal";
import type { LookupOption, Product } from "../../lib/products/types";

/** Ported from stockpilot-ai-ops's routes/_authenticated/products.tsx `Products`
 * component -- list + create/edit dialog + activate/deactivate, rebuilt as Server
 * Actions (see WarehousesList's docstring for why). Barcode/QR generation and the
 * spreadsheet import dialog are deferred to a later pass; the mobile-only card layout is
 * dropped the same way it was for warehouses. */
export function ProductsList({
  products,
  categoryNameById,
  supplierNameById,
  suppliers,
  canEdit,
  canViewCost,
  createAction,
  updateAction,
  toggleStatusAction,
}: {
  products: Product[];
  categoryNameById: Map<string, string>;
  supplierNameById: Map<string, string>;
  suppliers: LookupOption[];
  canEdit: boolean;
  canViewCost: boolean;
  createAction: (prevState: ProductActionState, formData: FormData) => Promise<ProductActionState>;
  updateAction: (
    productId: string,
    prevState: ProductActionState,
    formData: FormData,
  ) => Promise<ProductActionState>;
  toggleStatusAction: (productId: string, status: "active" | "inactive") => Promise<void>;
}) {
  const [modalTarget, setModalTarget] = useState<"create" | Product | null>(null);

  return (
    <div className="flex flex-col gap-4">
      {canEdit ? (
        <div className="flex justify-end">
          <Button size="sm" onClick={() => setModalTarget("create")}>
            <Plus className="size-4" aria-hidden="true" />
            New product
          </Button>
        </div>
      ) : null}

      {products.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border p-12 text-center">
          <Package className="size-8 text-muted-foreground" aria-hidden="true" />
          <p className="text-sm text-muted-foreground">No products yet. Add your first SKU.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>SKU</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Brand</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Supplier</TableHead>
                {canViewCost ? <TableHead className="text-right">Cost</TableHead> : null}
                <TableHead className="text-right">Price</TableHead>
                <TableHead>Status</TableHead>
                {canEdit ? <TableHead className="text-right">Actions</TableHead> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {products.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-mono text-xs">{p.sku}</TableCell>
                  <TableCell className="font-medium">{p.name}</TableCell>
                  <TableCell>{p.brand ?? "—"}</TableCell>
                  <TableCell>{categoryNameById.get(p.category_id ?? "") ?? "—"}</TableCell>
                  <TableCell>{supplierNameById.get(p.supplier_id ?? "") ?? "—"}</TableCell>
                  {canViewCost ? (
                    <TableCell className="text-right">
                      {p.cost_price == null ? "—" : inr.format(Number(p.cost_price))}
                    </TableCell>
                  ) : null}
                  <TableCell className="text-right">{inr.format(Number(p.selling_price))}</TableCell>
                  <TableCell>
                    <Badge variant={p.status === "active" ? "default" : "secondary"}>{p.status}</Badge>
                  </TableCell>
                  {canEdit ? (
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button variant="ghost" size="sm" onClick={() => setModalTarget(p)}>
                          <Pencil className="size-4" aria-hidden="true" />
                          Edit
                        </Button>
                        <form
                          action={toggleStatusAction.bind(
                            null,
                            p.id,
                            p.status === "active" ? "inactive" : "active",
                          )}
                        >
                          <SubmitButton variant="ghost" size="sm">
                            {p.status === "active" ? "Deactivate" : "Activate"}
                          </SubmitButton>
                        </form>
                      </div>
                    </TableCell>
                  ) : null}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {modalTarget ? (
        <ProductModal
          action={modalTarget === "create" ? createAction : updateAction.bind(null, modalTarget.id)}
          product={modalTarget === "create" ? undefined : modalTarget}
          categoryName={
            modalTarget === "create" ? undefined : categoryNameById.get(modalTarget.category_id ?? "")
          }
          suppliers={suppliers}
          onClose={() => setModalTarget(null)}
        />
      ) : null}
    </div>
  );
}
