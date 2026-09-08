export type NoteVisibility = "internal" | "customer";

export interface Note {
  id: string;
  business_id: string;
  job_id: string | null;
  opportunity_id: string | null;
  body: string;
  visibility: NoteVisibility;
  author_id: string;
  created_at: string;
}

export interface NoteItem extends Note {
  author_name: string;
}
