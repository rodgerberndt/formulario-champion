import { useNavigate } from "react-router-dom";
import { LandingNavbar } from "@/components/landing/LandingNavbar";
import { HeroSection } from "@/components/landing/HeroSection";
import { ProofMarquee } from "@/components/landing/ProofMarquee";
import { PainSection } from "@/components/landing/PainSection";
import { PortfolioSection } from "@/components/landing/PortfolioSection";
import { MetodoChampion } from "@/components/landing/MetodoChampion";
import { HowItWorks } from "@/components/landing/HowItWorks";
import { CaseVault } from "@/components/landing/CaseVault";
import { FinalCTA } from "@/components/landing/FinalCTA";
import { Footer } from "@/components/landing/Footer";
import { Button } from "@/components/ui/button";
import { useTracking } from "@/hooks/useTracking";
import { useUtmCapture } from "@/hooks/useUtmCapture";

const Index = () => {
  const navigate = useNavigate();
  const { trackStartClick } = useTracking();
  useUtmCapture();

  const handleStartClick = async (buttonId: string) => {
    try { await trackStartClick(buttonId); } catch {}
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
        {/* Subtle grid */}
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
        <HeroSection />
        <ProofMarquee />
        <PainSection />
        <PortfolioSection />
        <MetodoChampion />
        <HowItWorks />
        <CaseVault />
        <FinalCTA />
      </main>

      <Footer />

      {/* Mobile Bottom Bar CTA */}
      <div className="md:hidden mobile-bottom-cta">
        <Button
          size="lg"
          onClick={() => handleStartClick("start_btn_mobile")}
          className="w-full h-12 text-sm font-bold bg-secondary hover:bg-secondary/90 text-secondary-foreground rounded-xl shadow-lg"
        >
          PREENCHER QUIZ (2 MIN)
        </Button>
      </div>
      <div className="h-20 md:hidden" />
    </div>
  );
};

export default Index;
