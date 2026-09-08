-- F-9 (Reminders): idempotency markers for the reminder-sending cron
-- (packages/module-fsm/src/lib/reminders/mutations.ts#sendDueReminders). Both start
-- null and are set once a reminder for that event has actually been emailed -- a cron
-- run that finds a non-null value here skips the event, so re-running the cron (or a
-- Vercel Hobby plan's daily-only cadence re-checking a wider window) never double-sends.
--
-- Two separate columns, not one: fsm.events already models internal (kind='reminder')
-- and customer-facing (kind='work'/'estimate') reminders as distinct concepts (PRD §1.5)
-- with different recipients and different trigger conditions -- a `reminder` event could
-- theoretically get both an internal reminder emailed to its own assignees AND, if it
-- somehow also carried a customer-facing send, need to track that independently. In
-- practice each event only ever gets one of the two, but two columns cost nothing and
-- avoid conflating them.
alter table fsm.events
  add column customer_reminder_sent_at timestamptz,
  add column internal_reminder_sent_at timestamptz;
