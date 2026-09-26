import { cn } from "@cofounderai/core/lib/utils";
import type { OtherOfferingRole } from "../../lib/contacts/cross-offering";

/** DISC-OFFER-P1-04.3: "Elsewhere: IAM Training — User (set) · Cyber Assessment — no role
 * yet". One quiet line under a person, shown only when the same person is on file under
 * another of this business's offerings. */
export function OtherOfferingRoles({ roles, className }: { roles: OtherOfferingRole[] | undefined; className?: string }) {
  if (!roles || roles.length === 0) return null;
  return (
    <p className={cn("text-xs text-muted-foreground", className)}>
      Elsewhere:{" "}
      {roles.map((r, i) => (
        <span key={r.productId}>
          {i > 0 ? " · " : null}
          <span className="text-foreground">{r.productName}</span> — {r.roleLabel ?? "no role yet"}
          {r.roleSource === "persona" ? " (matched)" : null}
        </span>
      ))}
    </p>
  );
}
