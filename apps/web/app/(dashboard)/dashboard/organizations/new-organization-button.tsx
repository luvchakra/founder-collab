"use client";

import { Plus } from "lucide-react";
import { Button } from "@cofounderai/core/ui/button";
import { CREATE_BUSINESS_EVENT } from "@/components/dashboard/create-business-event";

/** PLATFORM-P1-10.14: opens the chrome's create-organization modal. */
export function NewOrganizationButton() {
  return (
    <Button type="button" onClick={() => window.dispatchEvent(new Event(CREATE_BUSINESS_EVENT))}>
      <Plus className="size-4" aria-hidden="true" />
      New organization
    </Button>
  );
}
