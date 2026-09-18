import { Navbar } from "@/components/marketing/navbar";
import { Hero } from "@/components/marketing/hero";
import { FounderProblem } from "@/components/marketing/founder-problem";
import { Transformation } from "@/components/marketing/transformation";
import { HowItWorks } from "@/components/marketing/how-it-works";
import { Benefits } from "@/components/marketing/benefits";
import { Differentiation } from "@/components/marketing/differentiation";
import { Modules } from "@/components/marketing/modules";
import { ModuleFlow } from "@/components/marketing/module-flow";
import { Trust } from "@/components/marketing/trust";
import { Pricing } from "@/components/marketing/pricing";
import { SocialProof } from "@/components/marketing/social-proof";
import { Faq } from "@/components/marketing/faq";
import { FinalCta } from "@/components/marketing/final-cta";
import { Footer } from "@/components/marketing/footer";

// co-founder-ai's own "/" is its marketing landing page. A signed-in visitor is sent
// straight to their dashboard by the proxy (packages/core/src/db/middleware.ts) before
// this ever renders -- deliberately not decided here, so the page reads nothing at
// request time and is prerendered once at build and served from the CDN.
export default function Home() {
  return (
    <div className="landing-theme flex flex-1 flex-col bg-landing-bg text-landing-fg">
      <Navbar />
      <main>
        <Hero />
        <FounderProblem />
        <Transformation />
        <HowItWorks />
        <Benefits />
        <Differentiation />
        <Modules />
        <ModuleFlow />
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
