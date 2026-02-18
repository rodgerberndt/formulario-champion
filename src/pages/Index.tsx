import { useNavigate } from "react-router-dom";
import { LandingNavbar } from "@/components/landing/LandingNavbar";
import { Hero } from "@/components/landing/Hero";
import { SocialProofCarousel } from "@/components/landing/SocialProofCarousel";
import { PainSection } from "@/components/landing/PainSection";
import { PortfolioSection } from "@/components/landing/PortfolioSection";
import { MetodoChampion } from "@/components/landing/MetodoChampion";
import { HowItWorks } from "@/components/landing/HowItWorks";
import { CaseVault } from "@/components/landing/CaseVault";
import { FinalCTA } from "@/components/landing/FinalCTA";
import { Footer } from "@/components/landing/Footer";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import { useTracking } from "@/hooks/useTracking";
import { useUtmCapture } from "@/hooks/useUtmCapture";
import { useSmoothScroll } from "@/hooks/useSmoothScroll";
import { useSectionThemes } from "@/hooks/useSectionThemes";

const Index = () => {
  const navigate = useNavigate();
  const { trackStartClick } = useTracking();
  useUtmCapture();
  useSmoothScroll();
  useSectionThemes();

  const handleStartClick = async (buttonId: string) => {
    try { await trackStartClick(buttonId); } catch (error) {
      console.error("Error tracking start click:", error);
    }
    await new Promise(resolve => setTimeout(resolve, 50));
    navigate("/quiz");
  };

  return (
    <div className="min-h-screen relative bg-background">
      {/* Cinematic background layers */}
      <div className="cinematic-bg" />
      <div className="cinematic-glow" />
      <div className="cinematic-vignette" />
      <div className="cinematic-grid" />

      <LandingNavbar />

      <main>
        {/* Hero */}
        <section data-theme="cave">
          <Hero onStartClick={() => handleStartClick("start_btn_1")} />
        </section>

        {/* Social Proof Carousel */}
        <section data-theme="void">
          <SocialProofCarousel />
        </section>


        {/* Pain Section */}
        <section data-theme="ember">
          <PainSection />
        </section>

        {/* Portfolio */}
        <section data-theme="blue-temple">
          <PortfolioSection />
        </section>

        {/* Método Champion */}
        <section data-theme="cave">
          <MetodoChampion />
        </section>

        {/* How It Works */}
        <section data-theme="blue-temple">
          <HowItWorks />
        </section>

        {/* Cases */}
        <section data-theme="gold-haze">
          <CaseVault />
        </section>

        {/* Final CTA */}
        <section data-theme="gold-haze">
          <FinalCTA />
        </section>
      </main>

      <Footer />

    </div>
  );
};

export default Index;
