import { createClient } from "../db/server";
import { publish } from "../events/mutations";
import type { Payment, PaymentAllocation, PaymentMethod } from "./types";

function coreClient() {
  return createClient({ schema: "core" });
}

export async function recordPayment(input: {
  businessId: string;
  partyId: string;
  method: PaymentMethod;
  amount: number;
  reference?: string | null;
  paymentDate?: string;
  notes?: string | null;
}): Promise<Payment> {
  const supabase = await coreClient();
  const { data, error } = await supabase
    .from("payments")
    .insert({
      business_id: input.businessId,
      party_id: input.partyId,
      method: input.method,
      amount: input.amount,
      reference: input.reference ?? null,
      payment_date: input.paymentDate ?? undefined,
      notes: input.notes ?? null,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

/** core.payment_allocations' own trigger (D-7) rejects an allocation that would push
 * the payment's total allocated amount past what it's actually worth -- this just
 * surfaces that as a normal thrown error, same as every other constraint violation.
 *
 * Publishes `payment.allocated` (ADR-5 mechanism 3) so an accounting module can post the
 * settlement to its ledger. Published on *allocation* rather than on `recordPayment`
 * deliberately: `core.payments` has no direction column, so a bare payment row cannot say
 * whether money came in or went out -- it is the document the payment is applied to that
 * settles that, and a payment split across three invoices is three settlements, each of
 * which the consumer needs to see separately.
 *
 * `requiredModule: 'gst'` so a business without an accounting licence parks the event
 * rather than failing it permanently, and `core.replay_parked_events()` replays the
 * backlog the moment they buy one -- the same guarantee `document.issued` already gets.
 */
export async function allocatePayment(input: {
  businessId: string;
  paymentId: string;
  documentId: string;
  amount: number;
}): Promise<PaymentAllocation> {
  const supabase = await coreClient();
  const { data, error } = await supabase
    .from("payment_allocations")
    .insert({
      business_id: input.businessId,
      payment_id: input.paymentId,
      document_id: input.documentId,
      amount: input.amount,
    })
    .select()
    .single();
  if (error) throw error;

  await publish({
    businessId: input.businessId,
    type: "payment.allocated",
    payload: {
      allocationId: data.id,
      paymentId: input.paymentId,
      documentId: input.documentId,
      amount: input.amount,
    },
    requiredModule: "gst",
  });

  return data;
}
