import { Hero } from "~/components/landing/Hero";
import { Metrics } from "~/components/landing/Metrics";
import { HowItWorks } from "~/components/landing/HowItWorks";
import { Architecture } from "~/components/landing/Architecture";
import { Footer } from "~/components/landing/Footer";
import { LandingNav } from "~/components/shared/LandingNav";

// Re-render hourly so the on-chain metrics stay current without paying
// for an RSC fetch on every visit. The dashboard hits live RPC directly.
export const revalidate = 3600;

export default function LandingPage() {
  return (
    <main>
      <LandingNav />
      <Hero />
      <Metrics />
      <HowItWorks />
      <Architecture />
      <Footer />
    </main>
  );
}
