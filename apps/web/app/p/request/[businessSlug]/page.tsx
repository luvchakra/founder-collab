import { resolveContactFormBusiness } from "@cofounderai/module-fsm/lib/work-requests/queries";
import { ContactForm } from "@cofounderai/module-fsm/components/work-requests/contact-form";
import { submitWorkRequestAction } from "./actions";

export default async function ContactFormPage({ params }: { params: Promise<{ businessSlug: string }> }) {
  const { businessSlug } = await params;
  const business = await resolveContactFormBusiness(businessSlug);

  if (!business) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-2 p-10 text-center">
        <h1 className="text-lg font-semibold">Form unavailable</h1>
        <p className="text-sm text-muted-foreground">This request form isn&apos;t available right now.</p>
      </div>
    );
  }

  return <ContactForm businessName={business.businessName} submitAction={submitWorkRequestAction.bind(null, business.businessId)} />;
}
