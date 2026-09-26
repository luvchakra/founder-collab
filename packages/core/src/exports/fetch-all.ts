/**
 * §37 -- "All matching records" must not be quietly cut short. PostgREST caps every
 * response at its `max-rows` setting (1,000 on Supabase by default), so an unbounded
 * `.select()` returns at most that many rows without any error. An export query that can
 * exceed it pages through in deterministic chunks instead: the caller builds the same
 * query (same predicates as the page) with a stable order -- ending in a unique column
 * such as `id` -- and this helper asks for it one `.range()` at a time until a short page
 * says there is nothing left.
 *
 * The chunk size must not exceed PostgREST's `max-rows` (Supabase's default is exactly
 * 1,000): a server capping pages below the chunk would return a "short" first page and end
 * the export there. If that setting is ever lowered, lower EXPORT_CHUNK_SIZE with it.
 */
export const EXPORT_CHUNK_SIZE = 1000;

type RangeQuery<T> = PromiseLike<{ data: T[] | null; error: unknown }>;

export async function fetchAllRows<T>(
  page: (from: number, to: number) => RangeQuery<T>,
  options: { chunkSize?: number; maxRows?: number } = {},
): Promise<T[]> {
  const chunk = options.chunkSize ?? EXPORT_CHUNK_SIZE;
  const max = options.maxRows ?? 200_000;
  const rows: T[] = [];
  for (let from = 0; from < max; from += chunk) {
    const { data, error } = await page(from, from + chunk - 1);
    if (error) throw error;
    const batch = data ?? [];
    rows.push(...batch);
    if (batch.length < chunk) break;
  }
  return rows;
}
