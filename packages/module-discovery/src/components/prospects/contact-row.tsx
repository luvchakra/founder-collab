"use client";

import { useState } from "react";
import { Pencil, X } from "lucide-react";
import { Input } from "@cofounderai/core/ui/input";
import { Label } from "@cofounderai/core/ui/label";
import { Button } from "@cofounderai/core/ui/button";
import { SubmitButton } from "@cofounderai/core/ui/submit-button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@cofounderai/core/ui/alert-dialog";
import type { Contact } from "../../lib/contacts/types";

/** Contact list item with an inline edit toggle -- same collapsed-heading/pencil-reveal
 * pattern as EditableName, extended to a multi-field form since a contact has more than
 * one editable value. */
export function ContactRow({
  contact,
  updateAction,
  deleteAction,
}: {
  contact: Contact;
  updateAction: (formData: FormData) => void | Promise<void>;
  deleteAction: (formData: FormData) => void | Promise<void>;
}) {
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <li className="rounded-md border p-3 text-sm">
        <form
          action={async (formData: FormData) => {
            await updateAction(formData);
            setEditing(false);
          }}
          className="grid grid-cols-1 gap-3 sm:grid-cols-2"
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`firstName-${contact.id}`}>First name</Label>
            <Input
              id={`firstName-${contact.id}`}
              name="firstName"
              defaultValue={contact.first_name ?? ""}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`lastName-${contact.id}`}>Last name</Label>
            <Input
              id={`lastName-${contact.id}`}
              name="lastName"
              defaultValue={contact.last_name ?? ""}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`jobTitle-${contact.id}`}>Job title</Label>
            <Input
              id={`jobTitle-${contact.id}`}
              name="jobTitle"
              defaultValue={contact.job_title ?? ""}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`email-${contact.id}`}>Email</Label>
            <Input
              id={`email-${contact.id}`}
              name="email"
              type="email"
              defaultValue={contact.email ?? ""}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`linkedinUrl-${contact.id}`}>LinkedIn URL</Label>
            <Input
              id={`linkedinUrl-${contact.id}`}
              name="linkedinUrl"
              defaultValue={contact.linkedin_url ?? ""}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`phone-${contact.id}`}>Phone</Label>
            <Input id={`phone-${contact.id}`} name="phone" defaultValue={contact.phone ?? ""} />
          </div>
          <div className="flex items-center gap-2 sm:col-span-2">
            <SubmitButton size="sm" pendingText="Saving...">
              Save
            </SubmitButton>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setEditing(false)}
            >
              <X className="size-4" aria-hidden="true" />
              Cancel
            </Button>
          </div>
        </form>
      </li>
    );
  }

  return (
    <li className="flex items-start justify-between gap-3 rounded-md border p-3 text-sm">
      <div>
        <p className="font-medium">
          {[contact.first_name, contact.last_name].filter(Boolean).join(" ") || "(no name)"}
          {contact.job_title ? (
            <span className="ml-2 font-normal text-muted-foreground">{contact.job_title}</span>
          ) : null}
        </p>
        <p className="mt-1 text-muted-foreground">
          {[contact.email, contact.phone, contact.linkedin_url].filter(Boolean).join(" · ") ||
            "No contact details"}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={`Edit ${contact.first_name ?? "contact"}`}
          onClick={() => setEditing(true)}
        >
          <Pencil className="size-4" aria-hidden="true" />
        </Button>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button type="button" variant="ghost" size="sm">
              Delete
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete this contact?</AlertDialogTitle>
              <AlertDialogDescription>
                This removes the contact and cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Keep contact</AlertDialogCancel>
              <form action={deleteAction}>
                <AlertDialogAction asChild>
                  <SubmitButton
                    variant="destructive"
                    pendingText="Deleting..."
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    Delete
                  </SubmitButton>
                </AlertDialogAction>
              </form>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </li>
  );
}
