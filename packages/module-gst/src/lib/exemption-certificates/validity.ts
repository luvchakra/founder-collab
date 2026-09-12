import type { ExemptionCertificate } from "./types";

export type ExemptionCertificateValidity = {
  valid: boolean;
  reason: string;
};

/**
 * COMPLY-P1-02.6: pure, DB-independent validity check -- a certificate is usable to
 * justify not collecting tax on a sale only when it is `active` (never explicitly
 * revoked), its `issuedDate` has arrived, and (if it has one) its `expiresAt` has not
 * passed. Mirrors the same "pure determination separated from its DB-touching caller"
 * convention every other determination in this module follows.
 */
export function isExemptionCertificateValid(cert: Pick<ExemptionCertificate, "status" | "issuedDate" | "expiresAt">, asOf: string): ExemptionCertificateValidity {
  if (cert.status === "revoked") return { valid: false, reason: "This certificate has been revoked." };
  if (cert.issuedDate > asOf) return { valid: false, reason: "This certificate's own issue date is in the future." };
  if (cert.expiresAt != null && cert.expiresAt < asOf) return { valid: false, reason: "This certificate has expired." };
  return { valid: true, reason: "Active, issued, and not expired as of the given date." };
}

/** Whether `cert`'s own `jurisdiction` covers `stateCode` -- `null` (not state-specific)
 * covers every state; a specific state code covers only itself. */
export function exemptionCertificateCoversState(cert: Pick<ExemptionCertificate, "jurisdiction">, stateCode: string): boolean {
  return cert.jurisdiction === null || cert.jurisdiction === stateCode;
}
