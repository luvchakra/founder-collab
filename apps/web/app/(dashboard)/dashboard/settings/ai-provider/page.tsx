import { redirect } from "next/navigation";

/** AI Provider settings merged into Billing (one "AI" section covers provider
 * connection, included credits, and buying more) -- this route stays as a redirect so
 * any existing bookmarks/links still land somewhere real. */
export default function AiProviderSettingsPage() {
  redirect("/dashboard/settings/billing");
}
