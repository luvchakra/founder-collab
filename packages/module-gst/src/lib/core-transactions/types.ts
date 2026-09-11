/**
 * COMPLY-P0-03.1 (Core Transaction Contract): the shape Compliance reads `core.documents`/
 * `core.document_lines`/`core.document_balances` into -- see `queries.ts`'s own docstring
 * for why this is a read-only accessor, not a new table (backlog §5's own "no duplicate
 * transaction masters," CLAUDE.md non-negotiable #5/#6). Field names are camelCase
 * translations of the underlying `core` columns, not new concepts -- the exact same
 * "HSN/tax_rate/taxable is a per-line SNAPSHOT, never re-derived from core.items live"
 * discipline `core.document_lines`' own migration comment establishes stays true here:
 * this contract reads that same snapshot, it doesn't recompute anything.
 */

export type DocumentLineContext = {
  id: string;
  itemId: string;
  description: string | null;
  quantity: number;
  unitPrice: number;
  hsnCode: string | null;
  taxRate: number;
  taxable: boolean;
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
};

export type DocumentContext = {
  id: string;
  businessId: string;
  docType: string;
  partyId: string;
  number: string | null;
  status: string;
  paymentStatus: string | null;
  docDate: string;
  dueDate: string | null;
  subtotal: number;
  discountAmount: number;
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
  shippingAmount: number;
  totalAmount: number;
  lines: DocumentLineContext[];
};

export type DocumentPaymentContext = {
  documentId: string;
  totalAmount: number;
  paidAmount: number;
  balanceAmount: number;
};
