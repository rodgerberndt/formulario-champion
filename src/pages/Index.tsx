import { useNavigate } from "react-router-dom";
import { Header } from "@/components/landing/Header";
import { Hero } from "@/components/landing/Hero";
import { SocialProofCarousel } from "@/components/landing/SocialProofCarousel";
import { Footer } from "@/components/landing/Footer";
import { BackgroundDecor } from "@/components/BackgroundDecor";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import { useTracking } from "@/hooks/useTracking";

const Index = () => {
  const navigate = useNavigate();
  const { trackStartClick } = useTracking();

  const handleStartClick = async (buttonId: string) => {
    // Track the click and wait for it to complete before navigating
    try {
      await trackStartClick(buttonId);
    } catch (error) {
      console.error("Error tracking start click:", error);
    }
    // Small delay to ensure tracking is sent
    await new Promise(resolve => setTimeout(resolve, 50));
    navigate("/quiz");
  };

  return (
    <div className="min-h-screen relative">
      <BackgroundDecor />
      <Header />
      
      <main>
        <Hero onStartClick={() => handleStartClick("start_btn_1")} />
        <SocialProofCarousel />
        
        {/* CTA Section before footer */}
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
      </main>

      <Footer />

      {/* Mobile Bottom Bar CTA */}
      <div className="md:hidden mobile-bottom-cta">
        <Button
          size="lg"
          onClick={() => handleStartClick("start_btn_3")}
          className="w-full h-12 text-sm font-semibold bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl shadow-lg shadow-primary/20"
        >
          COMEÇAR DIAGNÓSTICO (2 MIN)
        </Button>
      </div>

      {/* Spacer for mobile bottom bar */}
      <div className="h-20 md:hidden" />
    </div>
  );
};

export default Index;
