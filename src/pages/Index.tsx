import { useNavigate } from "react-router-dom";
import { LandingNavbar } from "@/components/landing/LandingNavbar";
import { Hero } from "@/components/landing/Hero";
import { useIsMobile } from "@/hooks/use-mobile";
import { SocialProofCarousel } from "@/components/landing/SocialProofCarousel";
import { PainSection } from "@/components/landing/PainSection";
import { PortfolioSection } from "@/components/landing/PortfolioSection";
import { MetodoChampion } from "@/components/landing/MetodoChampion";
import { HowItWorks } from "@/components/landing/HowItWorks";
import { GanchoCorpoSection } from "@/components/landing/GanchoCorpoSection";

import { FinalCTA } from "@/components/landing/FinalCTA";
import { Footer } from "@/components/landing/Footer";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import { useTracking } from "@/hooks/useTracking";
import { useUtmCapture } from "@/hooks/useUtmCapture";
import { useSmoothScroll } from "@/hooks/useSmoothScroll";
import { useSectionThemes } from "@/hooks/useSectionThemes";
import { useLandingTracking } from "@/hooks/useLandingTracking";

const Index = () => {
  const navigate = useNavigate();
  const { trackStartClick } = useTracking();
  const isMobile = useIsMobile();
  useUtmCapture();
  useSmoothScroll();
  useSectionThemes();
  useLandingTracking("/");

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
        <section data-theme="cave" data-track-id="hero" data-track-order="1">
          <Hero onStartClick={() => handleStartClick("start_btn_1")} />
        </section>

        <section data-theme="void" data-track-id="social_proof" data-track-order="2">
          <SocialProofCarousel />
        </section>

        <section data-theme="ember" data-track-id="dor" data-track-order="3">
          <PainSection />
        </section>

        <section data-theme="blue-temple" data-track-id="portfolio" data-track-order="4">
          <PortfolioSection />
        </section>

        <section data-theme="cave" data-track-id="cta_intermediario" data-track-order="5" className="py-10 md:py-16">
          <div className="container mx-auto px-5 text-center max-w-md">
            <p className="text-sm md:text-base text-muted-foreground mb-6">
              Responda o formulário rápido para que o próximo feedback seja você!
            </p>
            <Button
              size="lg"
              onClick={() => handleStartClick("start_btn_2")}
              data-track-click="cta_primary"
              data-track-id="cta_intermediario_btn"
              className="group h-12 md:h-14 px-6 md:px-10 text-sm md:text-base font-bold bg-primary hover:bg-primary/90 text-primary-foreground rounded-2xl shadow-xl shadow-primary/25 hover:shadow-2xl hover:shadow-primary/35 transition-all duration-200 active:scale-[0.98]"
            >
              FAZER DIAGNÓSTICO (2 MIN)
              <ArrowRight className="w-4 h-4 md:w-5 md:h-5 ml-2 group-hover:translate-x-1 transition-transform" />
            </Button>
          </div>
        </section>

        <section data-theme="cave" data-track-id="metodo" data-track-order="6">
          <MetodoChampion />
        </section>

        <section data-theme="blue-temple" data-track-id="gancho_corpo" data-track-order="7">
          <GanchoCorpoSection />
        </section>

        <section data-theme="blue-temple" data-track-id="como_funciona" data-track-order="8">
          <HowItWorks />
        </section>

        <section data-theme="gold-haze" data-track-id="cta_final" data-track-order="9">
          <FinalCTA />
        </section>
      </main>

      <Footer />

      {/* Mobile sticky CTA */}
      {isMobile && (
        <div className="fixed bottom-3 left-3 right-3 z-50 md:hidden">
          <Button
            size="sm"
            onClick={() => handleStartClick("mobile_sticky_cta")}
            className="w-full h-11 text-xs font-semibold bg-primary/95 hover:bg-primary text-primary-foreground rounded-xl shadow-lg shadow-primary/20 backdrop-blur-sm transition-all active:scale-[0.98]"
          >
            FAZER DIAGNÓSTICO
            <ArrowRight className="w-4 h-4 ml-1.5" />
          </Button>
        </div>
      )}
    </div>
  );
};

export default Index;
