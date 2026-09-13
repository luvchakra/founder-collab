import { resolveBusinessSlugById } from "@cofounderai/core/businesses/resolve";

/**
 * `revalidatePath()`/`redirect()` targets in Server Actions receive `businessId` (the
 * value they're already bound to), not `businessSlug` -- this resolves the one path
 * segment that changed to the current `/[businessSlug]/...` route shape. `core.
 * handle_new_business()` generates the slug synchronously as part of every business's
 * own creation, so a `businessId` already in play here is guaranteed to have one.
 */
export async function businessPath(businessId: string): Promise<string> {
  const slug = await resolveBusinessSlugById(businessId);
  return `/${slug}`;
}
