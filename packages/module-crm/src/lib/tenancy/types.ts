/** Minimal, duck-typed mirror of the platform's `core.businesses` row shape -- see
 * module-gst's own copy of this type/helper for why it's duplicated per module rather
 * than cross-imported (module boundary rules, 00-MASTER-PLAN.md §6). */
export type Business = {
  id: string;
  account_id: string;
  name: string;
  description: string | null;
  website: string | null;
  industry: string | null;
  created_at: string;
  updated_at: string;
};
