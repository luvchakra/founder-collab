"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { Button } from "@cofounderai/core/ui/button";
import { Label } from "@cofounderai/core/ui/label";
import { Textarea } from "@cofounderai/core/ui/textarea";
import { isAiProviderFailure } from "@cofounderai/core/ai-providers/is-provider-failure";
import { AiErrorOptions } from "../errors/ai-error-options";
import {
  runOnboardingAction,
  approveOnboardingIcpAction,
  type OnboardingActionState,
  type OnboardingResult,
} from "../../actions/onboarding";

type Step = 1 | 2 | 4 | 5;

const CARD_CLASS =
  "w-full max-w-lg rounded-2xl border border-landing-surface-border bg-landing-surface p-8";

export function OnboardingWizard({ accountId }: { accountId: string }) {
  const [step, setStep] = useState<Step>(1);
  const [productDescription, setProductDescription] = useState("");
  const [website, setWebsite] = useState("");
  const [targetAudience, setTargetAudience] = useState("");
  const [result, setResult] = useState<OnboardingResult | null>(null);
  const [approving, setApproving] = useState(false);
  const [approveError, setApproveError] = useState<string | null>(null);

  const [state, formAction, pending] = useActionState<OnboardingActionState, FormData>(
    async (prevState, formData) => {
      const next = await runOnboardingAction(prevState, formData);
      if (next && "data" in next) {
        setResult(next.data);
        setStep(4);
      }
      return next;
    },
    null,
  );

  if (pending) {
    return (
      <div className={CARD_CLASS}>
        <div className="flex flex-col items-center gap-3 py-8 text-center">
          <Loader2 className="size-6 animate-spin text-landing-accent" aria-hidden="true" />
          <p className="text-lg font-medium text-landing-fg">I&apos;m thinking...</p>
        </div>
      </div>
    );
  }

  if (step === 1) {
    return (
      <div className={CARD_CLASS}>
        <h1 className="text-2xl font-semibold text-landing-fg">Hey Founder 👋</h1>
        <p className="mt-1 text-landing-fg">What are you building?</p>
        <p className="mt-2 text-sm text-landing-muted">
          Tell me about your offering in your own words, and where I can see it live.
        </p>
        <div className="mt-6 flex flex-col gap-2">
          <Label htmlFor="productDescription" className="sr-only">
            What are you building?
          </Label>
          <Textarea
            id="productDescription"
            value={productDescription}
            onChange={(e) => setProductDescription(e.target.value)}
            rows={2}
            placeholder="e.g. A tool that helps small e-commerce shops automate their return requests..."
            autoFocus
          />
          <Label htmlFor="website" className="sr-only">
            Your website
          </Label>
          <Textarea
            id="website"
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
            rows={1}
            placeholder="Your offering's website (e.g. https://example.com)"
          />
        </div>
        <Button
          className="mt-6 w-full"
          disabled={!productDescription.trim() || !website.trim()}
          onClick={() => setStep(2)}
        >
          Next
        </Button>
      </div>
    );
  }

  if (step === 2) {
    return (
      <div className={CARD_CLASS}>
        <h1 className="text-2xl font-semibold text-landing-fg">Who do you think needs it?</h1>
        <form action={formAction} className="mt-6 flex flex-col gap-2">
          <input type="hidden" name="accountId" value={accountId} />
          <input type="hidden" name="productDescription" value={productDescription} />
          <input type="hidden" name="website" value={website} />
          <Label htmlFor="targetAudience" className="sr-only">
            Who do you think needs it?
          </Label>
          <Textarea
            id="targetAudience"
            name="targetAudience"
            value={targetAudience}
            onChange={(e) => setTargetAudience(e.target.value)}
            rows={2}
            placeholder="e.g. Small online stores doing $10k-100k/month in sales..."
            autoFocus
          />
          {state && "error" in state ? (
            <div className="mt-2 flex flex-col gap-2">
              <p role="alert" className="text-sm text-destructive">
                {state.error}
              </p>
              {isAiProviderFailure(state.error) ? <AiErrorOptions /> : null}
            </div>
          ) : null}
          <div className="mt-4 flex gap-3">
            <Button type="button" variant="ghost" onClick={() => setStep(1)}>
              Back
            </Button>
            <Button type="submit" className="flex-1" disabled={!targetAudience.trim()}>
              Analyze
            </Button>
          </div>
        </form>
      </div>
    );
  }

  if (step === 4 && result) {
    return (
      <div className={CARD_CLASS}>
        <h1 className="text-xl font-semibold text-landing-fg">
          Here&apos;s what I understand about your business.
        </h1>
        <dl className="mt-6 flex flex-col gap-4 text-sm">
          <div>
            <dt className="font-medium text-landing-accent">Offering</dt>
            <dd className="mt-1 text-landing-muted">{result.profile.category}</dd>
          </div>
          <div>
            <dt className="font-medium text-landing-accent">Problem</dt>
            <dd className="mt-1 text-landing-muted">{result.profile.problem}</dd>
          </div>
          <div>
            <dt className="font-medium text-landing-accent">Target Customer</dt>
            <dd className="mt-1 text-landing-muted">
              {[...result.icp.roles, ...result.icp.industries].filter(Boolean).join(" · ") ||
                result.icp.description}
            </dd>
          </div>
          <div>
            <dt className="font-medium text-landing-accent">Value Proposition</dt>
            <dd className="mt-1 text-landing-muted">{result.profile.solution}</dd>
          </div>
          <div>
            <dt className="font-medium text-landing-accent">Potential ICP</dt>
            <dd className="mt-1 text-landing-muted">
              {result.icp.name}
              {result.icp.description ? ` — ${result.icp.description}` : ""}
            </dd>
          </div>
        </dl>

        {approveError ? (
          <p role="alert" className="mt-4 text-sm text-destructive">
            {approveError}
          </p>
        ) : null}

        <div className="mt-8 flex gap-3">
          <Button
            variant="ghost"
            disabled={approving}
            onClick={() => {
              setResult(null);
              setStep(1);
            }}
          >
            Edit
          </Button>
          <Button
            className="flex-1"
            disabled={approving}
            onClick={async () => {
              setApproving(true);
              setApproveError(null);
              const outcome = await approveOnboardingIcpAction(result.icpId);
              setApproving(false);
              if (outcome?.error) {
                setApproveError(outcome.error);
                return;
              }
              setStep(5);
            }}
          >
            {approving ? "Saving..." : "Looks Good"}
          </Button>
        </div>
      </div>
    );
  }

  if (step === 5 && result) {
    return (
      <div className={`${CARD_CLASS} text-center`}>
        <h1 className="text-2xl font-semibold text-landing-fg">
          Ready to find your first customers?
        </h1>
        <Link
          href={`/dashboard/businesses/${result.businessId}/products/${result.productId}`}
          className="mt-8 inline-flex items-center justify-center gap-2 rounded-full bg-landing-accent px-7 py-3.5 text-base font-medium text-landing-accent-foreground transition-colors hover:bg-landing-accent/90"
        >
          Build My Customer Pipeline →
        </Link>
      </div>
    );
  }

  return null;
}
