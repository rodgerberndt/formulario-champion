import { useNavigate } from "react-router-dom";
import { Header } from "@/components/landing/Header";
import { Hero } from "@/components/landing/Hero";
import { SocialProofCarousel } from "@/components/landing/SocialProofCarousel";
import { Footer } from "@/components/landing/Footer";
import { BackgroundDecor } from "@/components/BackgroundDecor";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";

const Index = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen relative">
      <BackgroundDecor />
      <Header />
      
      <main>
        <Hero />
        <SocialProofCarousel />
        
        {/* CTA Section before footer */}
        <section className="py-12 md:py-20">
          <div className="container mx-auto px-4 text-center">
            <p className="text-lg md:text-xl text-muted-foreground mb-8 max-w-md mx-auto">
              Responda o formulário rápido para que o próximo feedback seja você!
            </p>
            <Button
              size="lg"
              onClick={() => navigate("/quiz")}
              className="group h-14 px-10 text-base font-semibold bg-primary hover:bg-primary/90 text-primary-foreground rounded-2xl shadow-xl shadow-primary/25 hover:shadow-2xl hover:shadow-primary/35 transition-all duration-300 active:scale-[0.98]"
            >
              FAZER DIAGNÓSTICO (2 MIN)
              <ArrowRight className="w-5 h-5 ml-2 group-hover:translate-x-1 transition-transform" />
            </Button>
          </div>
        </section>
      </main>

      <Footer />

      {/* Mobile Bottom Bar CTA */}
      <div className="md:hidden mobile-bottom-cta">
        <Button
          size="lg"
          onClick={() => navigate("/quiz")}
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
