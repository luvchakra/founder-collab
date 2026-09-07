/** Minimal, duck-typed mirror of module-discovery's own `core.businesses` row shape --
 * `core` is shared, cross-module data (00-MASTER-PLAN.md §6), but a module can't import
 * another module's internal types, so each module keeps its own small copy of the
 * fields it actually reads. */
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
