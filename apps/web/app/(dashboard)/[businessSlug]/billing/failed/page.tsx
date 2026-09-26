import Link from "next/link";
import { XCircle } from "lucide-react";
import { Button } from "@cofounderai/core/ui/button";

/**
 * BILL-11 -- the provider's cancel/failure return (§29). Shows no provider payload and
 * changes nothing: an abandoned checkout simply expires (BILL-08's 30-minute sessions).
 */
export default async function CheckoutFailedPage({
  params,
  searchParams,
}: {
  params: Promise<{ businessSlug: string }>;
  searchParams: Promise<{ reason?: string }>;
}) {
  const { businessSlug } = await params;
  const { reason } = await searchParams;
  const cancelled = reason === "cancelled";
  return (
    <main className="mx-auto flex w-full max-w-lg flex-1 flex-col items-center gap-5 py-10 text-center">
      <XCircle className="size-14 text-destructive" aria-hidden="true" />
      <h1 className="text-2xl font-semibold">{cancelled ? "Checkout cancelled" : "Payment didn't go through"}</h1>
      <p className="text-muted-foreground">
        {cancelled
          ? "You left the payment page before paying. Nothing was charged."
          : "Your payment couldn't be completed and you haven't been charged. You can try again, or use a different payment method."}
      </p>
      <div className="flex flex-wrap justify-center gap-2">
        <Button asChild>
          <Link href={`/${businessSlug}/billing/plans`}>Try again</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href={`/${businessSlug}/billing`}>Back to billing</Link>
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">
        Still stuck? Visit our <Link href="/help" className="font-medium text-primary hover:underline">help center</Link> and we&apos;ll sort it out.
      </p>
    </main>
  );
}
