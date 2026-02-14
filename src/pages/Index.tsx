import { useNavigate } from "react-router-dom";
import { LandingNavbar } from "@/components/landing/LandingNavbar";
import { Hero } from "@/components/landing/Hero";
import { SocialProofCarousel } from "@/components/landing/SocialProofCarousel";
import { ProofMarquee } from "@/components/landing/ProofMarquee";
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

const Index = () => {
  const navigate = useNavigate();
  const { trackStartClick } = useTracking();
  useUtmCapture();

  const handleStartClick = async (buttonId: string) => {
    try { await trackStartClick(buttonId); } catch (error) {
      console.error("Error tracking start click:", error);
    }
    await new Promise(resolve => setTimeout(resolve, 50));
    navigate("/quiz");
  };

  return (
    <div className="min-h-screen relative bg-background">
      {/* Fixed background */}
      <div className="fixed inset-0 pointer-events-none -z-10" style={{ contain: "strict" }}>
        <div
          className="absolute inset-0"
          style={{
            background: "linear-gradient(135deg, hsl(235 80% 3%) 0%, hsl(238 70% 6%) 40%, hsl(235 80% 3%) 100%)",
          }}
        />
        <div
          className="hidden md:block absolute inset-0 opacity-[0.015]"
          style={{
            backgroundImage: "linear-gradient(to right, hsl(0 0% 100%) 1px, transparent 1px), linear-gradient(to bottom, hsl(0 0% 100%) 1px, transparent 1px)",
            backgroundSize: "80px 80px",
          }}
        />
      </div>

      <LandingNavbar />

      <main>
        {/* Original Hero — preserved exactly */}
        <Hero onStartClick={() => handleStartClick("start_btn_1")} />

        {/* Original Social Proof Carousel — preserved exactly */}
        <SocialProofCarousel />

        {/* Original CTA Section — preserved exactly */}
        <section className="py-10 md:py-16">
          <div className="container mx-auto px-5 text-center max-w-md">
            <p className="text-sm md:text-base text-muted-foreground mb-6">
              Responda o formulário rápido para que o próximo feedback seja você!
            </p>
            <Button
              size="lg"
              onClick={() => handleStartClick("start_btn_2")}
              className="group h-12 md:h-14 px-6 md:px-10 text-sm md:text-base font-semibold bg-primary hover:bg-primary/90 text-primary-foreground rounded-2xl shadow-xl shadow-primary/25 hover:shadow-2xl hover:shadow-primary/35 transition-all duration-200 active:scale-[0.98]"
            >
              FAZER DIAGNÓSTICO (2 MIN)
              <ArrowRight className="w-4 h-4 md:w-5 md:h-5 ml-2 group-hover:translate-x-1 transition-transform" />
            </Button>
          </div>
        </section>

        {/* === NEW SECTIONS BELOW === */}
        {/* ProofMarquee removida */}
        <PainSection />
        {/* PortfolioSection removida — sem vídeos reais de portfólio ainda */}
        <MetodoChampion />
        <HowItWorks />
        <CaseVault />
        <FinalCTA />
      </main>

      <Footer />

      {/* Mobile Bottom Bar CTA — preserved */}
      <div className="md:hidden mobile-bottom-cta">
        <Button
          size="lg"
          onClick={() => handleStartClick("start_btn_3")}
          className="w-full h-12 text-sm font-semibold bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl shadow-lg shadow-primary/20"
        >
          COMEÇAR DIAGNÓSTICO (2 MIN)
        </Button>
      </div>
      <div className="h-20 md:hidden" />
    </div>
  );
};

export default Index;
