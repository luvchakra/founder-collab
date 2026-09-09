"use client";

import { useRef, useState, useTransition } from "react";
import { Paperclip, Trash2 } from "lucide-react";
import { Badge } from "@cofounderai/core/ui/badge";
import { Button } from "@cofounderai/core/ui/button";
import { Input } from "@cofounderai/core/ui/input";
import { Label } from "@cofounderai/core/ui/label";
import { SubmitButton } from "@cofounderai/core/ui/submit-button";
import { Textarea } from "@cofounderai/core/ui/textarea";
import { NativeSelect } from "@cofounderai/core/ui/native-select";
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
import { inr } from "@cofounderai/core/lib/format";
import { formatDate, formatDateTime } from "@cofounderai/core/lib/format";
import type { Expense } from "../../lib/expenses/types";
import type { JobAttachmentItem } from "../../lib/attachments/types";
import type { NoteItem, NoteVisibility } from "../../lib/notes/types";
import type { SignatureItem } from "../../lib/signatures/types";
import type { OpenTimeEntry, TimeEntryItem } from "../../lib/time-entries/types";
import { SignaturePad } from "./signature-pad";

function minutesLabel(minutes: number | null) {
  if (minutes === null) return "--";
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

/** One tab bundling every PRD §1.8 field-execution action (clock in/out, charges --
 * estimates.edit's own EstimateBuilder already covers those on the opportunity side, so
 * not repeated here --, expenses, notes, attachments, signature) rather than five
 * separate tabs: on a phone-width screen (the PRD's own "mobile-first" requirement) a
 * five-tab bar doesn't fit, and these all belong to the same "what happened at this
 * job" story anyway. */
export function FieldWorkTab({
  jobId,
  timeEntries,
  openTimeEntry,
  expenses,
  notes,
  attachments,
  signatures,
  canEditTime,
  canEditExpenses,
  canEditNotes,
  canEditJob,
  clockInAction,
  clockOutAction,
  addExpenseAction,
  deleteExpenseAction,
  addNoteAction,
  uploadAttachmentAction,
  deleteAttachmentAction,
  captureSignatureAction,
}: {
  jobId: string;
  timeEntries: TimeEntryItem[];
  openTimeEntry: OpenTimeEntry | null;
  expenses: Expense[];
  notes: NoteItem[];
  attachments: JobAttachmentItem[];
  signatures: SignatureItem[];
  canEditTime: boolean;
  canEditExpenses: boolean;
  canEditNotes: boolean;
  canEditJob: boolean;
  clockInAction: () => Promise<void>;
  clockOutAction: () => Promise<void>;
  addExpenseAction: (description: string, amount: number) => Promise<void>;
  deleteExpenseAction: (id: string) => Promise<void>;
  addNoteAction: (body: string, visibility: NoteVisibility) => Promise<void>;
  uploadAttachmentAction: (formData: FormData) => Promise<void>;
  deleteAttachmentAction: (id: string) => Promise<void>;
  captureSignatureAction: (formData: FormData) => Promise<void>;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [expenseDescription, setExpenseDescription] = useState("");
  const [expenseAmount, setExpenseAmount] = useState("");
  const [noteBody, setNoteBody] = useState("");
  const [noteVisibility, setNoteVisibility] = useState<NoteVisibility>("internal");
  const [signerName, setSignerName] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const signaturePadRef = useRef<{ toBlob: () => Promise<Blob | null>; clear: () => void }>(null);

  const run = (fn: () => Promise<void>) => {
    setError(null);
    startTransition(async () => {
      try {
        await fn();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong.");
      }
    });
  };

  const isClockedInHere = openTimeEntry?.job_id === jobId;
  const isClockedInElsewhere = openTimeEntry !== null && !isClockedInHere;

  return (
    <div className="flex flex-col gap-8">
      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <section>
        <h2 className="mb-2 text-sm font-semibold text-muted-foreground uppercase">Time</h2>
        {canEditTime ? (
          <div className="mb-3 flex items-center gap-2">
            {isClockedInHere ? (
              <Button size="sm" disabled={pending} onClick={() => run(clockOutAction)}>
                Clock out
              </Button>
            ) : (
              <Button size="sm" disabled={pending || isClockedInElsewhere} onClick={() => run(clockInAction)}>
                Clock in
              </Button>
            )}
            {isClockedInElsewhere ? <span className="text-xs text-muted-foreground">Clock out of your other job first.</span> : null}
          </div>
        ) : null}
        {timeEntries.length === 0 ? (
          <p className="text-sm text-muted-foreground">No time logged yet.</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {timeEntries.map((entry) => (
              <li key={entry.id} className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm">
                <span>
                  {entry.employee_name} -- {formatDateTime(entry.started_at)}
                  {entry.ended_at ? ` to ${formatDateTime(entry.ended_at)}` : " (in progress)"}
                </span>
                <span className="text-xs text-muted-foreground">{minutesLabel(entry.duration_minutes)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-muted-foreground uppercase">Expenses</h2>
        {canEditExpenses ? (
          <form
            className="mb-3 grid gap-2 sm:grid-cols-[1fr_140px_auto]"
            action={async () => {
              const amount = Number(expenseAmount);
              if (!expenseDescription.trim() || !Number.isFinite(amount)) return;
              setError(null);
              try {
                await addExpenseAction(expenseDescription, amount);
                setExpenseDescription("");
                setExpenseAmount("");
              } catch (err) {
                setError(err instanceof Error ? err.message : "Something went wrong.");
              }
            }}
          >
            <Input value={expenseDescription} onChange={(e) => setExpenseDescription(e.target.value)} placeholder="Description" />
            <Input value={expenseAmount} onChange={(e) => setExpenseAmount(e.target.value)} type="number" step="0.01" placeholder="Amount" />
            <SubmitButton size="sm" disabled={!expenseDescription.trim() || !expenseAmount}>
              Add
            </SubmitButton>
          </form>
        ) : null}
        {expenses.length === 0 ? (
          <p className="text-sm text-muted-foreground">No expenses logged yet.</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {expenses.map((expense) => (
              <li key={expense.id} className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm">
                <span>
                  {expense.description} <span className="text-xs text-muted-foreground">({formatDate(expense.incurred_on)})</span>
                </span>
                <div className="flex items-center gap-2">
                  <span>{inr.format(expense.amount)}</span>
                  {canEditExpenses ? (
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <button type="button" aria-label="Delete expense" className="rounded p-1 hover:bg-muted">
                          <Trash2 className="size-3.5" aria-hidden="true" />
                        </button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete this expense?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This removes the logged expense and cannot be undone.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Keep expense</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => run(() => deleteExpenseAction(expense.id))}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          >
                            Delete
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-muted-foreground uppercase">Notes</h2>
        {canEditNotes ? (
          <div className="mb-3 flex flex-col gap-2">
            <Textarea value={noteBody} onChange={(e) => setNoteBody(e.target.value)} placeholder="Add a note from the field" rows={2} />
            <div className="flex items-center gap-2">
              <NativeSelect value={noteVisibility} onChange={(e) => setNoteVisibility(e.target.value as NoteVisibility)} className="w-auto">
                <option value="internal">Internal only</option>
                <option value="customer">Visible to customer</option>
              </NativeSelect>
              <Button
                size="sm"
                disabled={pending || !noteBody.trim()}
                onClick={() =>
                  run(async () => {
                    await addNoteAction(noteBody, noteVisibility);
                    setNoteBody("");
                  })
                }
              >
                Add note
              </Button>
            </div>
          </div>
        ) : null}
        {notes.length === 0 ? (
          <p className="text-sm text-muted-foreground">No notes yet.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {notes.map((note) => (
              <li key={note.id} className="rounded-lg border border-border px-3 py-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="font-medium">{note.author_name}</span>
                  <div className="flex items-center gap-2">
                    <Badge variant={note.visibility === "customer" ? "secondary" : "outline"} className="text-[10px]">
                      {note.visibility === "customer" ? "Customer-visible" : "Internal"}
                    </Badge>
                    <span className="text-xs text-muted-foreground">{formatDateTime(note.created_at)}</span>
                  </div>
                </div>
                <p className="mt-1 whitespace-pre-wrap text-muted-foreground">{note.body}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-muted-foreground uppercase">Photos &amp; files</h2>
        {canEditJob ? (
          <div className="mb-3 flex items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,video/*,application/pdf"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                const formData = new FormData();
                formData.set("file", file);
                run(async () => {
                  await uploadAttachmentAction(formData);
                  if (fileInputRef.current) fileInputRef.current.value = "";
                });
              }}
            />
            <Button type="button" variant="outline" size="sm" disabled={pending} onClick={() => fileInputRef.current?.click()}>
              <Paperclip className="size-4" aria-hidden="true" />
              Add photo, video, or PDF
            </Button>
          </div>
        ) : null}
        {attachments.length === 0 ? (
          <p className="text-sm text-muted-foreground">No attachments yet.</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {attachments.map((attachment) => (
              <li key={attachment.id} className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm">
                <a href={attachment.url} target="_blank" rel="noreferrer" className="truncate hover:underline">
                  {attachment.file_name}
                </a>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  {formatDate(attachment.created_at)}
                  {canEditJob ? (
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <button type="button" aria-label="Delete attachment" className="rounded p-1 hover:bg-muted">
                          <Trash2 className="size-3.5" aria-hidden="true" />
                        </button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete &quot;{attachment.file_name}&quot;?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This permanently removes the file and cannot be undone.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Keep file</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => run(() => deleteAttachmentAction(attachment.id))}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          >
                            Delete
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-muted-foreground uppercase">Signature</h2>
        {canEditJob ? (
          <div className="mb-3 flex flex-col gap-2">
            <Input value={signerName} onChange={(e) => setSignerName(e.target.value)} placeholder="Signer's name" className="max-w-xs" />
            <SignaturePad ref={signaturePadRef} />
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => signaturePadRef.current?.clear()}>
                Clear
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={pending || !signerName.trim()}
                onClick={() =>
                  run(async () => {
                    const blob = await signaturePadRef.current?.toBlob();
                    if (!blob) throw new Error("Draw a signature first.");
                    const formData = new FormData();
                    formData.set("signer_name", signerName);
                    formData.set("image", blob, "signature.png");
                    await captureSignatureAction(formData);
                    setSignerName("");
                    signaturePadRef.current?.clear();
                  })
                }
              >
                Save signature
              </Button>
            </div>
          </div>
        ) : null}
        {signatures.length === 0 ? (
          <p className="text-sm text-muted-foreground">No signature captured yet.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {signatures.map((signature) => (
              <li key={signature.id} className="flex items-center gap-3 rounded-lg border border-border px-3 py-2 text-sm">
                {signature.image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={signature.image_url} alt={`${signature.signer_name}'s signature`} className="h-10 w-24 rounded border border-border bg-white object-contain" />
                ) : null}
                <div>
                  <p className="font-medium">{signature.signer_name}</p>
                  <p className="text-xs text-muted-foreground">{formatDateTime(signature.signed_at)}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
