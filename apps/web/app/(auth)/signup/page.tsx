import { AuthForm } from "@/components/auth/auth-form";
import { signup } from "@/app/(auth)/actions";

export default function SignupPage() {
  return (
    <div className="w-full max-w-sm rounded-2xl border border-landing-surface-border bg-landing-surface p-8">
      <h1 className="text-2xl font-semibold text-landing-fg">Let&apos;s find your first customers.</h1>
      <p className="mt-2 text-sm text-landing-muted">
        Create your CoFounderAI account and start building your customer pipeline.
      </p>
      <div className="mt-8">
        <AuthForm mode="signup" action={signup} />
      </div>
    </div>
  );
}
