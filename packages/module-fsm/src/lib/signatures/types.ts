export interface Signature {
  id: string;
  business_id: string;
  document_id: string | null;
  job_id: string | null;
  signer_name: string;
  signed_at: string;
  image_attachment_id: string | null;
  created_at: string;
}

export interface SignatureItem extends Signature {
  image_url: string | null;
}
