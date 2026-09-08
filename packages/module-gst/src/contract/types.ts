/** Mirrors `module-inventory`'s own `contract/types.ts#ContractResult` exactly (ADR-10:
 * a caller not licensed for `gst` gets `{ ok: false, error: "MODULE_NOT_LICENSED" }`
 * back as a normal value, not an exception). */
export type ContractResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: "MODULE_NOT_LICENSED" | "NOT_FOUND" | string };

export type ContractEinvoice = {
  status: "generated" | "cancelled";
  irn: string | null;
  ackNo: string | null;
  ackDate: string | null;
  qrCode: string | null;
};

export type ContractEwayBill = {
  status: "generated" | "cancelled";
  ewayBillNumber: string | null;
  validUntil: string | null;
  qrCode: string | null;
};

export type ContractGstDocumentStatus = {
  einvoice: ContractEinvoice | null;
  ewayBill: ContractEwayBill | null;
};
