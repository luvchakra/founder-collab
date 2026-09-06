import { redirect } from "next/navigation";
import { createClient } from "@cofounderai/core/db/server";
import { Navbar } from "@/components/marketing/navbar";
import { Hero } from "@/components/marketing/hero";
import { FounderProblem } from "@/components/marketing/founder-problem";
import { Transformation } from "@/components/marketing/transformation";
import { HowItWorks } from "@/components/marketing/how-it-works";
import { Benefits } from "@/components/marketing/benefits";
import { Differentiation } from "@/components/marketing/differentiation";
import { ProspectIntelligence } from "@/components/marketing/prospect-intelligence";
import { Trust } from "@/components/marketing/trust";
import { Pricing } from "@/components/marketing/pricing";
import { SocialProof } from "@/components/marketing/social-proof";
import { Faq } from "@/components/marketing/faq";
import { FinalCta } from "@/components/marketing/final-cta";
import { Footer } from "@/components/marketing/footer";

// co-founder-ai's own "/" is its marketing landing page -- a signed-in visitor skips
// straight to their dashboard instead, same as the P-0 scaffold's original redirect.
export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) redirect("/dashboard");

  return (
    <div className="landing-theme dark flex flex-1 flex-col bg-landing-bg text-landing-fg">
      <Navbar />
      <main>
        <Hero />
        <FounderProblem />
        <Transformation />
        <HowItWorks />
        <Benefits />
        <Differentiation />
        <ProspectIntelligence />
        <Trust />
        <Pricing />
        <SocialProof />
        <Faq />
        <FinalCta />
      </main>
      <Footer />
    </div>
  );
}
