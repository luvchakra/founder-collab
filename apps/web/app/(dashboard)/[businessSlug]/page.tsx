import { redirect } from "next/navigation";

/**
 * The business's own landing page is Discovery's module dashboard, one level down at
 * /discovery/dashboard -- the same "<module>/dashboard" shape every other module uses.
 * Kept as a real redirect (not just a sidebar/switcher convention) so any existing link,
 * bookmark, or typed-in bare business URL still lands somewhere real.
 */
export default async function BusinessRootPage({
  params,
}: {
  params: Promise<{ businessSlug: string }>;
}) {
  const { businessSlug } = await params;
  redirect(`/${businessSlug}/discovery/dashboard`);
}
