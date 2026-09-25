import { Input } from "@cofounderai/core/ui/input";
import { Textarea } from "@cofounderai/core/ui/textarea";
import { NativeSelect } from "@cofounderai/core/ui/native-select";
import type { FundingRound, Investor, InvestorContact, OutreachDraft } from "../../lib/funding/types";
import { Field } from "../marketing/field";

/** FND-11 — the outreach draft form (§27.2). Saving never sends; sending is a separate,
 * approved action. */
export function OutreachFields({
  draft,
  investors,
  contacts,
  rounds,
  defaultInvestorId,
}: {
  draft?: OutreachDraft | null;
  investors: Pick<Investor, "id" | "name">[];
  contacts: InvestorContact[];
  rounds: Pick<FundingRound, "id" | "name">[];
  defaultInvestorId?: string | null;
}) {
  const d = draft ?? null;
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Investor" htmlFor="o-investor">
          {d ? (
            <>
              <Input id="o-investor" value={d.investorName ?? ""} disabled readOnly />
              <input type="hidden" name="investorId" value={d.investorId} />
            </>
          ) : (
            <NativeSelect id="o-investor" name="investorId" required defaultValue={defaultInvestorId ?? ""}>
              <option value="" disabled>
                Choose an investor
              </option>
              {investors.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name}
                </option>
              ))}
            </NativeSelect>
          )}
        </Field>
        <Field label="To" htmlFor="o-contact" hint="Blank sends to the investor's general email.">
          <NativeSelect id="o-contact" name="contactId" defaultValue={d?.contactId ?? ""}>
            <option value="">General email</option>
            {contacts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {c.email ? ` <${c.email}>` : " (no email)"}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Round" htmlFor="o-round">
          <NativeSelect id="o-round" name="roundId" defaultValue={d?.roundId ?? rounds[0]?.id ?? ""}>
            <option value="">None</option>
            {rounds.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </NativeSelect>
        </Field>
      </div>
      <Field label="Subject" htmlFor="o-subject">
        <Input id="o-subject" name="subject" required maxLength={300} defaultValue={d?.subject ?? ""} />
      </Field>
      <Field label="Message" htmlFor="o-body">
        <Textarea id="o-body" name="body" rows={12} required maxLength={20000} defaultValue={d?.body ?? ""} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Call to action" htmlFor="o-cta">
          <Input id="o-cta" name="cta" defaultValue={d?.cta ?? ""} placeholder="A 30-minute call next week" />
        </Field>
        <Field label="Personalisation notes" htmlFor="o-notes" hint="Why this investor — for you, not sent.">
          <Input id="o-notes" name="personalizationNotes" defaultValue={d?.personalizationNotes ?? ""} />
        </Field>
      </div>
    </>
  );
}
