/**
 * §37 -- "All matching records" must not be quietly cut short. PostgREST caps every
 * response at its `max-rows` setting (1,000 on Supabase by default), so an unbounded
 * `.select()` returns at most that many rows without any error. An export query that can
 * exceed it pages through in deterministic chunks instead: the caller builds the same
 * query (same predicates as the page) with a stable order -- ending in a unique column
 * such as `id` -- and this helper asks for it one `.range()` at a time until a short page
 * says there is nothing left.
 *
 * "Short" is judged against what the server actually returned on the first full request,
 * not against the chunk size asked for: if PostgREST's `max-rows` is ever set below the
 * chunk size, every page comes back at that lower size, and treating the first one as the
 * last would silently cut the export to one page. So the effective page size is learnt
 * from the first response, and paging stops only on a page shorter than that -- or empty.
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
  let pageSize = chunk;
  let from = 0;
  while (from < max) {
    const { data, error } = await page(from, from + pageSize - 1);
    if (error) throw error;
    const batch = data ?? [];
    rows.push(...batch);
    if (batch.length === 0) break;
    if (from === 0 && batch.length < pageSize) {
      // Either the whole result was smaller than one chunk, or the server caps pages below
      // the chunk size -- one more request tells the two apart.
      pageSize = batch.length;
    } else if (batch.length < pageSize) {
      break;
    }
    from += batch.length;
  }
  return rows;
}
