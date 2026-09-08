export interface WorkRequestInput {
  name: string;
  email?: string;
  phone?: string;
  addressText?: string;
  message?: string;
}

export interface ContactFormBusiness {
  businessId: string;
  businessName: string;
}
