"use client";

import Link from "next/link";
import { Badge } from "@cofounderai/core/ui/badge";
import { EmptyState } from "@cofounderai/core/ui/empty-state";
import { SubmitButton } from "@cofounderai/core/ui/submit-button";
import { StatusBadge } from "@cofounderai/core/ui/status-badge";
import { formatDate } from "@cofounderai/core/lib/format";
import { cn } from "@cofounderai/core/lib/utils";
import { Landmark } from "lucide-react";
import { isSafeAutoMatch, type MatchSuggestion } from "../../lib/accounting/bank-matching";
import { ledgerAmount } from "./labels";
import type {
  BankTransactionRow,
  TransactionWithSuggestions,
} from "../../lib/accounting/banking-queries";

const STATUS_LABEL: Record<BankTransactionRow["status"], string> = {
  unmatched: "To match",
  matched: "Matched",
  reconciled: "Reconciled",
  ignored: "Set aside",
};

/**
 * Statement lines, and what the ledger might have to say about each.
 *
 * Suggestions are offered, never applied: a wrong automatic match hides a real missing
 * entry behind a plausible-looking one, and nobody goes looking for a transaction that is
 * already ticked off. Where the matcher is both confident and unrivalled it says so, which
 * is a different claim from "this is the one".
 */
export function BankTransactionsView({
  unmatched,
  settled,
  journalPath,
  canManage,
  matchAction,
  unmatchAction,
  ignoreAction,
}: {
  unmatched: TransactionWithSuggestions[];
  settled: BankTransactionRow[];
  journalPath: string;
  canManage: boolean;
  matchAction: (transactionId: string, entryId: string) => Promise<void>;
  unmatchAction: (transactionId: string) => Promise<void>;
  ignoreAction: (transactionId: string) => Promise<void>;
}) {
  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-muted-foreground">
          To match {unmatched.length > 0 ? `(${unmatched.length})` : ""}
        </h2>

        {unmatched.length === 0 ? (
          <EmptyState
            icon={Landmark}
            variant="inline"
            message="Every line on this account is accounted for."
          />
        ) : (
          <ul className="flex flex-col gap-3">
            {unmatched.map(({ transaction, suggestions }) => (
              <li key={transaction.id} className="rounded-2xl border border-border bg-card">
                <div className="flex flex-col gap-2 border-b border-border p-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <p className="font-medium break-words">{transaction.description}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(transaction.txn_date)}
                      {transaction.reference ? ` · ${transaction.reference}` : ""}
                    </p>
                  </div>
                  <p
                    className={cn(
                      "shrink-0 font-semibold tabular-nums",
                      transaction.amount < 0 ? "text-destructive-subtle" : "text-success-subtle",
                    )}
                  >
                    {transaction.amount > 0 ? "+" : ""}
                    {ledgerAmount.format(transaction.amount)}
                  </p>
                </div>

                <div className="flex flex-col gap-2 p-3">
                  {suggestions.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      Nothing in the ledger matches this amount within a week of this date. It may
                      need a journal entry, or it may be a transfer between your own accounts.
                    </p>
                  ) : (
                    <>
                      {isSafeAutoMatch(suggestions) ? (
                        <p className="text-xs text-success-subtle">
                          One clear match — same amount, and nothing else close.
                        </p>
                      ) : suggestions.length > 1 ? (
                        <p className="text-xs text-muted-foreground">
                          More than one entry fits. Pick the right one.
                        </p>
                      ) : null}

                      <ul className="flex flex-col gap-2">
                        {suggestions.map((suggestion) => (
                          <SuggestionRow
                            key={suggestion.candidate.entryId}
                            suggestion={suggestion}
                            journalPath={journalPath}
                            canManage={canManage}
                            onAccept={matchAction.bind(null, transaction.id, suggestion.candidate.entryId)}
                          />
                        ))}
                      </ul>
                    </>
                  )}

                  {canManage ? (
                    <form action={ignoreAction.bind(null, transaction.id)} className="self-end">
                      <SubmitButton variant="ghost" size="sm">
                        Set aside
                      </SubmitButton>
                    </form>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {settled.length > 0 ? (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold text-muted-foreground">Everything else</h2>
          <ul className="divide-y rounded-2xl border border-border">
            {settled.map((transaction) => (
              <li key={transaction.id} className="flex flex-col gap-2 p-3 text-sm sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="break-words">{transaction.description}</p>
                  <p className="text-xs text-muted-foreground">{formatDate(transaction.txn_date)}</p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <StatusBadge
                    status={transaction.status === "ignored" ? "on_hold" : transaction.status}
                    label={STATUS_LABEL[transaction.status]}
                  />
                  <span className="font-medium tabular-nums">
                    {transaction.amount > 0 ? "+" : ""}
                    {ledgerAmount.format(transaction.amount)}
                  </span>
                  {canManage && transaction.status === "matched" ? (
                    <form action={unmatchAction.bind(null, transaction.id)}>
                      <SubmitButton variant="ghost" size="sm">
                        Unmatch
                      </SubmitButton>
                    </form>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function SuggestionRow({
  suggestion,
  journalPath,
  canManage,
  onAccept,
}: {
  suggestion: MatchSuggestion;
  journalPath: string;
  canManage: boolean;
  onAccept: () => Promise<void>;
}) {
  const { candidate, confidence, reasons } = suggestion;
  return (
    <li className="flex flex-col gap-2 rounded-xl border border-border p-2.5 text-sm sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="font-medium">
          <Link href={`${journalPath}/${candidate.entryId}`} className="hover:underline">
            {candidate.entryNumber ?? "Journal entry"}
          </Link>
          <span className="ml-2 font-normal text-muted-foreground">{formatDate(candidate.postingDate)}</span>
        </p>
        <p className="text-xs text-muted-foreground break-words">{candidate.memo ?? "No description"}</p>
        {/* Why it was suggested. A match nobody can explain is a match nobody should
            accept. */}
        <p className="mt-1 flex flex-wrap gap-1.5">
          {reasons.map((reason) => (
            <Badge key={reason} variant="secondary" className="font-normal">
              {reason}
            </Badge>
          ))}
        </p>
      </div>
      {canManage ? (
        <form action={onAccept} className="shrink-0">
          <SubmitButton size="sm" variant={confidence === "exact" ? "default" : "outline"} pendingText="Matching...">
            This one
          </SubmitButton>
        </form>
      ) : null}
    </li>
  );
}
