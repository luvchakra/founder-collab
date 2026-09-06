import { AuthForm } from "@/components/auth/auth-form";
import { login } from "@/app/(auth)/actions";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <div className="w-full max-w-sm rounded-2xl border border-landing-surface-border bg-landing-surface p-8">
      <h1 className="text-2xl font-semibold text-landing-fg">Welcome back, Founder.</h1>
      <p className="mt-2 text-sm text-landing-muted">Your next customer is waiting.</p>
      {error ? (
        <p role="alert" className="mt-4 text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <div className="mt-8">
        <AuthForm mode="login" action={login} />
      </div>
    </div>
  );
}
