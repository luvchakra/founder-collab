export interface Attachment {
  id: string;
  business_id: string;
  entity_type: string;
  entity_id: string;
  storage_bucket: string;
  storage_path: string;
  file_name: string;
  content_type: string | null;
  size_bytes: number | null;
  uploaded_by: string;
  created_at: string;
}
