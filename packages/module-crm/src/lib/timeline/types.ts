/** CRM-02.3's relationship timeline. `source` identifies which module/channel an entry
 * came from (acceptance criterion: "Events identify source module/channel");
 * `detailHref` is set only where a real detail page already exists to link to
 * (acceptance criterion: "User can open the underlying detail where permitted" -- "where
 * permitted" is read as "where a page actually exists," not a new permissions concept). */
export type TimelineSource = "crm.activity" | "crm.interaction" | "inventory.order" | "fsm.job" | "fsm.quote" | "discovery.prospect";

export type TimelineEntry = {
  id: string;
  source: TimelineSource;
  occurredAt: string;
  label: string;
  detail: string | null;
  detailHref: string | null;
};
