export interface JobAttachmentItem {
  id: string;
  file_name: string;
  content_type: string | null;
  size_bytes: number | null;
  created_at: string;
  url: string;
}
