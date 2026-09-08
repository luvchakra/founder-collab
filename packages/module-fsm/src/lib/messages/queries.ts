import { getThreadForEntity, listMessagesForThread } from "@cofounderai/core/messages/queries";
import type { Message } from "@cofounderai/core/messages/types";

/** A job's own message thread (F-11, PRD §9) -- `core.threads` filtered to
 * `entity_type='job'`. Empty when nothing has ever been sent or received on this job
 * yet; callers treat that as "no messages", not an error. */
export async function listJobMessages(businessId: string, jobId: string): Promise<Message[]> {
  const thread = await getThreadForEntity(businessId, "job", jobId);
  if (!thread) return [];
  return listMessagesForThread(thread.id);
}
