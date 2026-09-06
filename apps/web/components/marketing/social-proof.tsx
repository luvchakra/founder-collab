import { FadeIn } from "./fade-in";

/** No fabricated testimonials or customer logos (landing requirements #20) -- once real
 * testimonials/usage metrics exist, replace this with founder testimonial cards (name,
 * company, role, photo, measurable outcome). */
export function SocialProof() {
  return (
    <section className="px-6 py-16">
      <FadeIn>
        <p className="mx-auto max-w-2xl text-balance text-center text-lg text-landing-muted">
          Built for founders who are building their first customer pipeline.
        </p>
      </FadeIn>
    </section>
  );
}
