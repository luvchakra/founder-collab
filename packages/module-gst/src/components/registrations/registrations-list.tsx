"use client";

import { useState } from "react";
import { Landmark, Pencil, Plus, Star } from "lucide-react";
import { Button } from "@cofounderai/core/ui/button";
import { Badge } from "@cofounderai/core/ui/badge";
import { SubmitButton } from "@cofounderai/core/ui/submit-button";
import { EmptyState } from "@cofounderai/core/ui/empty-state";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@cofounderai/core/ui/table";
import { RegistrationModal, type TaxRegistrationActionState } from "./registration-modal";
import {
  RegistrationProfileModal,
  type GstRegistrationProfileActionState,
} from "./registration-profile-modal";
import { parseGstRegistrationProfile } from "../../lib/tax-registrations/gst-registration-profile";
import { getJurisdictions } from "../../lib/compliance/jurisdictions";
import type { TaxRegistration, TaxRegistrationStatus } from "../../lib/tax-registrations/types";

const STATUS_BADGE: Record<TaxRegistrationStatus, { label: string; variant: "default" | "secondary" | "outline" }> = {
  active: { label: "Active", variant: "default" },
  suspended: { label: "Suspended", variant: "secondary" },
  cancelled: { label: "Cancelled", variant: "outline" },
};

const REGISTRATION_TYPE_LABEL: Record<"regular" | "composition", string> = {
  regular: "Regular",
  composition: "Composition",
};

/**
 * COMPLY-P0-04.1 (GSTIN Management) + COMPLY-P0-04.2 (GST Profile): multiple GST
 * registrations for one business, listed newest first (the order
 * `listTaxRegistrationsForRegime` already returns, primary first within the regime).
 * Compact cards below `md` (CLAUDE.md rule #12) -- same table+card split
 * `WarehousesList` already established, reused rather than reinvented (CLAUDE.md's
 * "every module's screens share this one design system").
 *
 * No inline edit of a registration's own GSTIN/state -- those never change once added
 * (see `RegistrationModal`'s own docstring). "Edit profile" (COMPLY-P0-04.2) is a
 * different, narrower edit: registration type/date/return frequency/e-invoice
 * eligibility, the India-GST attributes that live in `metadata` (+ `registered_from`),
 * never the identity fields. The "Type" column shown here is that same profile's
 * `registrationType`, defaulted via `parseGstRegistrationProfile` for a registration that
 * hasn't had its profile edited yet -- never blank, since every registration has an
 * implicit default (Regular) until told otherwise.
 */
export function RegistrationsList({
  country,
  regime,
  regimeName,
  registrations,
  canEdit,
  createAction,
  setPrimaryAction,
  setStatusAction,
  setProfileAction,
}: {
  country: string;
  regime: string;
  regimeName: string;
  registrations: TaxRegistration[];
  canEdit: boolean;
  createAction: (prevState: TaxRegistrationActionState, formData: FormData) => Promise<TaxRegistrationActionState>;
  setPrimaryAction: (registrationId: string) => Promise<void>;
  setStatusAction: (registrationId: string, status: TaxRegistrationStatus) => Promise<void>;
  setProfileAction: (
    registrationId: string,
    prevState: GstRegistrationProfileActionState,
    formData: FormData,
  ) => Promise<GstRegistrationProfileActionState>;
}) {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [profileTarget, setProfileTarget] = useState<TaxRegistration | null>(null);
  // The GST Profile editor (registration type/return frequency/e-invoice eligibility)
  // is India-GST-specific by construction (see setGstRegistrationProfile's own
  // docstring) -- every other country/regime has no such profile to edit yet.
  const isIndiaGst = country === "IN" && regime === "GST";
  const numberLabel = isIndiaGst ? "GSTIN" : "registration number";
  const jurisdictionLevel = getJurisdictions(country)[0]?.level;
  const jurisdictionLabel = jurisdictionLevel ? jurisdictionLevel[0]!.toUpperCase() + jurisdictionLevel.slice(1) : "Jurisdiction";

  return (
    <div className="flex flex-col gap-4">
      {canEdit ? (
        <div className="flex justify-end">
          <Button size="sm" onClick={() => setShowCreateModal(true)}>
            <Plus className="size-4" aria-hidden="true" />
            Add {isIndiaGst ? "GSTIN" : "registration"}
          </Button>
        </div>
      ) : null}

      {registrations.length === 0 ? (
        <EmptyState
          icon={Landmark}
          message={`No ${regimeName} registrations yet. Add your business's first ${numberLabel} to get started.`}
        />
      ) : (
        <div className="rounded-2xl border border-border">
          <ul className="divide-y md:hidden">
            {registrations.map((reg) => {
              const type = isIndiaGst ? parseGstRegistrationProfile(reg.metadata).registrationType : null;
              return (
                <li key={reg.id} className="flex flex-col gap-2 p-3 text-sm">
                  <div className="flex min-w-0 items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="flex items-center gap-1.5 font-medium break-words">
                        {reg.registration_number}
                        {reg.is_primary ? (
                          <Star className="size-3.5 shrink-0 fill-primary text-primary" aria-label="Primary" />
                        ) : null}
                      </p>
                      <p className="text-xs text-muted-foreground">{reg.jurisdiction ?? "—"}</p>
                    </div>
                    <Badge variant={STATUS_BADGE[reg.registration_status].variant} className="shrink-0">
                      {STATUS_BADGE[reg.registration_status].label}
                    </Badge>
                  </div>

                  {type ? (
                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <Badge variant="outline">{REGISTRATION_TYPE_LABEL[type]}</Badge>
                    </div>
                  ) : null}

                  {canEdit ? (
                    <RegistrationRowActions
                      registration={reg}
                      isIndiaGst={isIndiaGst}
                      setPrimaryAction={setPrimaryAction}
                      setStatusAction={setStatusAction}
                      onEditProfile={() => setProfileTarget(reg)}
                    />
                  ) : null}
                </li>
              );
            })}
          </ul>

          <Table className="hidden md:table">
            <TableHeader>
              <TableRow>
                <TableHead>{isIndiaGst ? "GSTIN" : "Registration number"}</TableHead>
                <TableHead>{jurisdictionLabel}</TableHead>
                {isIndiaGst ? <TableHead>Type</TableHead> : null}
                <TableHead>Status</TableHead>
                <TableHead>Primary</TableHead>
                {canEdit ? <TableHead className="text-right">Actions</TableHead> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {registrations.map((reg) => {
                const type = isIndiaGst ? parseGstRegistrationProfile(reg.metadata).registrationType : null;
                return (
                  <TableRow key={reg.id}>
                    <TableCell className="font-medium">{reg.registration_number}</TableCell>
                    <TableCell>{reg.jurisdiction ?? "—"}</TableCell>
                    {isIndiaGst ? (
                      <TableCell>
                        <Badge variant="outline">{REGISTRATION_TYPE_LABEL[type!]}</Badge>
                      </TableCell>
                    ) : null}
                    <TableCell>
                      <Badge variant={STATUS_BADGE[reg.registration_status].variant}>
                        {STATUS_BADGE[reg.registration_status].label}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {reg.is_primary ? <Star className="size-4 fill-primary text-primary" aria-label="Primary" /> : null}
                    </TableCell>
                    {canEdit ? (
                      <TableCell className="text-right">
                        <RegistrationRowActions
                          registration={reg}
                          isIndiaGst={isIndiaGst}
                          setPrimaryAction={setPrimaryAction}
                          setStatusAction={setStatusAction}
                          onEditProfile={() => setProfileTarget(reg)}
                          align="end"
                        />
                      </TableCell>
                    ) : null}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {showCreateModal ? (
        <RegistrationModal country={country} regime={regime} regimeName={regimeName} action={createAction} onClose={() => setShowCreateModal(false)} />
      ) : null}
      {profileTarget ? (
        <RegistrationProfileModal
          registration={profileTarget}
          action={setProfileAction.bind(null, profileTarget.id)}
          onClose={() => setProfileTarget(null)}
        />
      ) : null}
    </div>
  );
}

function RegistrationRowActions({
  registration,
  isIndiaGst,
  setPrimaryAction,
  setStatusAction,
  onEditProfile,
  align = "start",
}: {
  registration: TaxRegistration;
  /** The "Edit profile" action (registration type/return frequency/e-invoice
   * eligibility) is India-GST-specific -- see `setGstRegistrationProfile`'s own
   * docstring -- so it's hidden entirely for every other country/regime rather than
   * opening an editor for fields that don't apply. */
  isIndiaGst: boolean;
  setPrimaryAction: (registrationId: string) => Promise<void>;
  setStatusAction: (registrationId: string, status: TaxRegistrationStatus) => Promise<void>;
  onEditProfile: () => void;
  align?: "start" | "end";
}) {
  return (
    <div className={`flex flex-wrap gap-2 ${align === "end" ? "justify-end" : "justify-start"}`}>
      {isIndiaGst ? (
        <Button variant="ghost" size="sm" onClick={onEditProfile}>
          <Pencil className="size-4" aria-hidden="true" />
          Edit profile
        </Button>
      ) : null}
      {!registration.is_primary && registration.registration_status === "active" ? (
        <form action={setPrimaryAction.bind(null, registration.id)}>
          <SubmitButton variant="ghost" size="sm">
            Set primary
          </SubmitButton>
        </form>
      ) : null}
      {registration.registration_status === "active" ? (
        <form action={setStatusAction.bind(null, registration.id, "suspended")}>
          <SubmitButton variant="ghost" size="sm">
            Suspend
          </SubmitButton>
        </form>
      ) : null}
      {registration.registration_status === "suspended" ? (
        <form action={setStatusAction.bind(null, registration.id, "active")}>
          <SubmitButton variant="ghost" size="sm">
            Reactivate
          </SubmitButton>
        </form>
      ) : null}
      {registration.registration_status !== "cancelled" ? (
        <form action={setStatusAction.bind(null, registration.id, "cancelled")}>
          <SubmitButton variant="ghost" size="sm" className="text-destructive hover:text-destructive">
            Cancel
          </SubmitButton>
        </form>
      ) : null}
    </div>
  );
}
