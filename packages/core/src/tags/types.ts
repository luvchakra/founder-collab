export interface Tag {
  id: string;
  business_id: string;
  scope: string;
  name: string;
  color: string | null;
  created_at: string;
}

export interface Tagging {
  id: string;
  business_id: string;
  tag_id: string;
  taggable_type: string;
  taggable_id: string;
  created_at: string;
}
