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
  const isMobile = useIsMobile();
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
        {/* CTA between Portfolio and Método */}
        <section data-theme="cave" className="py-10 md:py-16">
          <div className="container mx-auto px-5 text-center max-w-md">
            <p className="text-sm md:text-base text-muted-foreground mb-6">
              Responda o formulário rápido para que o próximo feedback seja você!
            </p>
            <Button
              size="lg"
              onClick={() => handleStartClick("start_btn_2")}
              className="group h-12 md:h-14 px-6 md:px-10 text-sm md:text-base font-bold bg-primary hover:bg-primary/90 text-primary-foreground rounded-2xl shadow-xl shadow-primary/25 hover:shadow-2xl hover:shadow-primary/35 transition-all duration-200 active:scale-[0.98]"
            >
              FAZER DIAGNÓSTICO (2 MIN)
              <ArrowRight className="w-4 h-4 md:w-5 md:h-5 ml-2 group-hover:translate-x-1 transition-transform" />
            </Button>
          </div>
        </section>

        {/* Método Champion */}
        <section data-theme="cave">
          <MetodoChampion />
        </section>

        {/* Gancho & Corpo — diferencial Champion */}
        <section data-theme="blue-temple">
          <GanchoCorpoSection />
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

      {/* Mobile sticky CTA */}
      {isMobile && (
        <div className="fixed bottom-4 left-4 right-4 z-50 md:hidden">
          <Button
            size="lg"
            onClick={() => handleStartClick("mobile_sticky_cta")}
            className="w-full h-14 text-sm font-bold bg-primary hover:bg-primary/90 text-primary-foreground rounded-2xl shadow-2xl shadow-primary/30 transition-all active:scale-[0.98]"
          >
            FAZER DIAGNÓSTICO
            <ArrowRight className="w-5 h-5 ml-2" />
          </Button>
        </div>
      )}
    </div>
  );
};

export default Index;
