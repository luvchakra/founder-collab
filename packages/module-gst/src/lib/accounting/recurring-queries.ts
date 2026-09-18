import { cache } from "react";
import { createClient } from "../../db/server";
import { nextOccurrence, type RecurrenceFrequency, type RecurringTemplateLine } from "./recurring";

export interface RecurringEntryRow {
  id: string;
  name: string;
  memo: string | null;
  frequency: RecurrenceFrequency;
  anchor_date: string;
  end_on: string | null;
  last_run_on: string | null;
  is_active: boolean;
  template_lines: RecurringTemplateLine[];
}

export interface RecurringEntryWithSchedule extends RecurringEntryRow {
  /** Null once the schedule has ended, or when it is switched off. */
  nextRunOn: string | null;
  /** The template's own size — debits and credits are equal, so either side is "the
   * amount". */
  amount: number;
}

export const listRecurringEntries = cache(
  async (businessId: string): Promise<RecurringEntryWithSchedule[]> => {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("recurring_entries")
      .select("id, name, memo, frequency, anchor_date, end_on, last_run_on, is_active, template_lines")
      .eq("business_id", businessId)
      .order("name", { ascending: true });
    if (error) throw error;

    const today = new Date().toISOString().slice(0, 10);
    return ((data ?? []) as RecurringEntryRow[]).map((row) => {
      const lines = (row.template_lines ?? []) as RecurringTemplateLine[];
      return {
        ...row,
        template_lines: lines,
        amount: Math.round(lines.reduce((sum, l) => sum + (Number(l.debit) || 0), 0) * 100) / 100,
        nextRunOn: row.is_active
          ? nextOccurrence(row.anchor_date, row.frequency, today, {
              lastRunOn: row.last_run_on,
              endOn: row.end_on,
            })
          : null,
      };
    });
  },
);
