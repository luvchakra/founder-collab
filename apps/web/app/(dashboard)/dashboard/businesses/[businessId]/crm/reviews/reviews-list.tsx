"use client";

import { useState } from "react";
import { MessageSquareText, Sparkles, Star } from "lucide-react";
import { Badge } from "@cofounderai/core/ui/badge";
import { Button } from "@cofounderai/core/ui/button";
import { Alert, AlertDescription } from "@cofounderai/core/ui/alert";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@cofounderai/core/ui/dialog";
import { Textarea } from "@cofounderai/core/ui/textarea";
import { SubmitButton } from "@cofounderai/core/ui/submit-button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@cofounderai/core/ui/table";
import { formatDate } from "@cofounderai/core/lib/format";
import type { ReviewItem, ReviewItemStatus } from "@cofounderai/module-crm/lib/reviews/types";

const STATUS_VARIANT: Record<ReviewItemStatus, "default" | "secondary" | "outline"> = {
  new: "outline",
  in_progress: "secondary",
  responded: "default",
  dismissed: "outline",
};
const STATUS_LABEL: Record<ReviewItemStatus, string> = {
  new: "Awaiting reply",
  in_progress: "In progress",
  responded: "Replied",
  dismissed: "Dismissed",
};

function RatingStars({ rating }: { rating: number | null }) {
  if (rating === null) return <span className="text-xs text-muted-foreground">No rating</span>;
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`${rating} out of 5 stars`}>
      {Array.from({ length: 5 }, (_, i) => (
        <Star key={i} className={`h-3.5 w-3.5 ${i < rating ? "fill-amber-400 text-amber-400" : "text-muted-foreground"}`} />
      ))}
    </span>
  );
}

function RespondButton({ review, disabled, onClick }: { review: ReviewItem; disabled: boolean; onClick: () => void }) {
  if (review.status === "responded") return <span className="text-xs text-muted-foreground">Already replied</span>;
  return (
    <Button size="sm" variant="outline" disabled={disabled} onClick={onClick}>
      <MessageSquareText className="mr-1.5 size-3.5" />
      Respond
    </Button>
  );
}

/**
 * CRM-08.6's own UI: drafting and publishing a reply to one review, in a dialog opened
 * from either layout below `md`. "AI drafts response" is the "Generate AI draft" /
 * "Regenerate" button (`generateDraftAction`, not tied to form submission since it
 * doesn't publish anything); "human approval required before publishing" is the
 * editable `Textarea` -- the human can rewrite the draft entirely before the "Approve &
 * publish" click, and whatever text is in the box at that point is what actually gets
 * sent, not a silent re-read of the last AI draft. The `Alert` is this story's third
 * acceptance criterion made literal: publishing is a real external action against this
 * business's own connected Google authorization, stated plainly before the button that
 * does it, not buried in a tooltip.
 */
export function ReviewsList({
  businessId,
  reviews,
  canRespond,
  generateDraftAction,
  publishAction,
}: {
  businessId: string;
  reviews: ReviewItem[];
  canRespond: boolean;
  generateDraftAction: (reviewId: string) => Promise<{ draftReply: string } | { error: string }>;
  publishAction: (reviewId: string, replyText: string) => Promise<{ error: string } | void>;
}) {
  const [responding, setResponding] = useState<ReviewItem | null>(null);
  const [replyText, setReplyText] = useState("");
  const [isDrafting, setIsDrafting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function openRespond(review: ReviewItem) {
    setResponding(review);
    setReplyText(review.draft_reply ?? "");
    setError(null);
  }

  async function generateDraft() {
    if (!responding) return;
    setIsDrafting(true);
    setError(null);
    const result = await generateDraftAction(responding.id);
    setIsDrafting(false);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    setReplyText(result.draftReply);
  }

  async function publish(form: FormData) {
    if (!responding) return;
    setError(null);
    const text = String(form.get("replyText") ?? "");
    const result = await publishAction(responding.id, text);
    if (result && "error" in result) {
      setError(result.error);
      return;
    }
    setResponding(null);
  }

  return (
    <>
      <div className="rounded-2xl border border-border">
        <ul className="divide-y md:hidden">
          {reviews.map((review) => (
            <li key={review.id} className="flex flex-col gap-2 p-3 text-sm">
              <div className="flex min-w-0 items-start justify-between gap-2">
                <span className="min-w-0 break-words font-medium">{review.reviewer_name ?? "Anonymous"}</span>
                <Badge variant={STATUS_VARIANT[review.status]} className="shrink-0">
                  {STATUS_LABEL[review.status]}
                </Badge>
              </div>
              <RatingStars rating={review.rating} />
              <p className="text-muted-foreground">{review.comment_excerpt ?? "(no comment)"}</p>
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-muted-foreground">{formatDate(review.occurred_at)}</span>
                {canRespond ? <RespondButton review={review} disabled={!businessId} onClick={() => openRespond(review)} /> : null}
              </div>
            </li>
          ))}
        </ul>

        <Table className="hidden md:table">
          <TableHeader>
            <TableRow>
              <TableHead>Rating</TableHead>
              <TableHead>Reviewer</TableHead>
              <TableHead>Comment</TableHead>
              <TableHead>Posted</TableHead>
              <TableHead>Reply state</TableHead>
              {canRespond ? <TableHead className="text-right">Actions</TableHead> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {reviews.map((review) => (
              <TableRow key={review.id}>
                <TableCell>
                  <RatingStars rating={review.rating} />
                </TableCell>
                <TableCell className="font-medium">{review.reviewer_name ?? "Anonymous"}</TableCell>
                <TableCell className="max-w-md truncate text-muted-foreground">{review.comment_excerpt ?? "(no comment)"}</TableCell>
                <TableCell className="whitespace-nowrap text-muted-foreground">{formatDate(review.occurred_at)}</TableCell>
                <TableCell>
                  <Badge variant={STATUS_VARIANT[review.status]}>{STATUS_LABEL[review.status]}</Badge>
                </TableCell>
                {canRespond ? (
                  <TableCell className="text-right">
                    <RespondButton review={review} disabled={false} onClick={() => openRespond(review)} />
                  </TableCell>
                ) : null}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog
        open={responding !== null}
        onOpenChange={(open) => {
          if (!open) {
            setResponding(null);
            setError(null);
          }
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Respond to review</DialogTitle>
          </DialogHeader>
          {responding ? (
            <form action={publish} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1 rounded-lg border border-border bg-muted/30 p-3 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{responding.reviewer_name ?? "Anonymous"}</span>
                  <RatingStars rating={responding.rating} />
                </div>
                <p className="text-muted-foreground">{responding.comment_excerpt ?? "(no comment)"}</p>
              </div>

              <div className="flex items-center justify-between">
                <label htmlFor="replyText" className="text-sm font-medium">
                  Your reply
                </label>
                <Button type="button" size="sm" variant="ghost" onClick={generateDraft} disabled={isDrafting}>
                  <Sparkles className="mr-1.5 size-3.5" />
                  {isDrafting ? "Drafting..." : responding.draft_reply || replyText ? "Regenerate AI draft" : "Generate AI draft"}
                </Button>
              </div>
              <Textarea id="replyText" name="replyText" rows={5} value={replyText} onChange={(e) => setReplyText(e.target.value)} placeholder="Write or generate a reply..." required />

              <Alert>
                <AlertDescription>
                  Publishing posts this reply directly to Google Business Profile on {`this business's`} behalf, using its connected authorization. Google reviews published
                  replies against its own content policies.
                </AlertDescription>
              </Alert>

              {error ? (
                <p role="alert" className="text-sm text-destructive">
                  {error}
                </p>
              ) : null}

              <DialogFooter>
                <Button type="button" variant="ghost" onClick={() => setResponding(null)}>
                  Cancel
                </Button>
                <SubmitButton pendingText="Publishing...">Approve &amp; publish</SubmitButton>
              </DialogFooter>
            </form>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
