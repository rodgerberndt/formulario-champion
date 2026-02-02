import { Button } from "@/components/ui/button";
import { ArrowRight, Users, Sparkles, TrendingUp, Trophy } from "lucide-react";
import founderPhoto from "@/assets/founder-photo.png";

interface HeroProps {
  onScrollToQuiz: () => void;
}

export function Hero({ onScrollToQuiz }: HeroProps) {
  return (
    <section className="min-h-[80vh] md:min-h-screen flex items-center justify-center pt-14 pb-16 md:pb-12 relative overflow-hidden">
      {/* Background Effects */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="hero-glow top-1/4 left-1/2 -translate-x-1/2" />
        <div className="absolute top-20 right-10 w-32 h-32 bg-secondary/5 rounded-full blur-2xl" />
        <div className="absolute bottom-40 left-10 w-24 h-24 bg-secondary/5 rounded-full blur-2xl" />
        
        {/* Floating Trophies */}
        <Trophy className="absolute top-[15%] left-[8%] w-8 h-8 text-secondary/20 animate-float" style={{ animationDelay: "0s" }} />
        <Trophy className="absolute top-[25%] right-[12%] w-6 h-6 text-secondary/15 animate-float" style={{ animationDelay: "1s" }} />
        <Trophy className="absolute top-[60%] left-[5%] w-10 h-10 text-secondary/10 animate-float" style={{ animationDelay: "2s" }} />
        <Trophy className="absolute top-[70%] right-[8%] w-7 h-7 text-secondary/20 animate-float" style={{ animationDelay: "0.5s" }} />
        <Trophy className="absolute top-[40%] left-[15%] w-5 h-5 text-secondary/15 animate-float" style={{ animationDelay: "1.5s" }} />
        <Trophy className="absolute top-[50%] right-[20%] w-9 h-9 text-secondary/10 animate-float" style={{ animationDelay: "2.5s" }} />
        <Trophy className="absolute top-[80%] left-[25%] w-6 h-6 text-secondary/15 animate-float" style={{ animationDelay: "3s" }} />
        <Trophy className="absolute top-[10%] right-[30%] w-8 h-8 text-secondary/10 animate-float" style={{ animationDelay: "0.8s" }} />
      </div>

      <div className="container mx-auto px-4 relative z-10">
        <div className="max-w-5xl mx-auto">
          <div className="grid md:grid-cols-2 gap-8 md:gap-12 items-center">
            {/* Content */}
            <div className="text-center md:text-left order-2 md:order-1">
              {/* Badge */}
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-secondary/10 border border-secondary/20 mb-5 animate-fade-in">
                <Sparkles className="w-3 h-3 text-secondary" />
                <span className="text-xs text-secondary font-medium">
                  Diagnóstico gratuito de 2 minutos
                </span>
              </div>

              {/* Headline */}
              <h1 className="font-display text-2xl sm:text-3xl md:text-4xl champion-gradient-text mb-4 animate-slide-up tracking-wider leading-tight">
                SE VOCÊ NÃO TESTA CRIATIVO TODA SEMANA,<br className="hidden sm:block" /> 
                PODE ESTAR DEIXANDO DINHEIRO NA MESA.
              </h1>

              {/* Subheadline */}
              <p className="text-sm md:text-base text-muted-foreground max-w-md mx-auto md:mx-0 mb-6 animate-slide-up" style={{ animationDelay: "0.1s" }}>
                O criativo Champion que vai mudar o seu game.<br />
                Diagnóstico gratuito de 2 minutos.
              </p>

              {/* CTA */}
              <div className="flex flex-col items-center md:items-start gap-4 mb-8 animate-slide-up" style={{ animationDelay: "0.2s" }}>
                <Button
                  variant="champion"
                  size="lg"
                  onClick={onScrollToQuiz}
                  className="group cta-glow text-sm"
                >
                  FAZER DIAGNÓSTICO (2 MIN)
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </Button>
              </div>

              {/* Micro Proofs */}
              <div className="flex flex-wrap items-center justify-center md:justify-start gap-4 md:gap-6 text-muted-foreground animate-fade-in" style={{ animationDelay: "0.3s" }}>
                <div className="flex items-center gap-2">
                  <Users className="w-4 h-4 text-secondary" />
                  <span className="text-xs">
                    <strong className="text-foreground">+ de 1.1k</strong> clientes
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-secondary" />
                  <span className="text-xs">
                    <strong className="text-foreground">+ de 8k</strong> criativos
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-secondary" />
                  <span className="text-xs">
                    <strong className="text-foreground">3.7</strong> ROI médio
                  </span>
                </div>
              </div>
            </div>

            {/* Photo */}
            <div className="flex justify-center md:justify-end order-1 md:order-2 animate-fade-in">
              <div className="relative">
                {/* Glow behind photo */}
                <div className="absolute -inset-4 bg-secondary/30 blur-3xl rounded-full animate-pulse-slow" />
                <div className="absolute -inset-2 bg-gradient-to-br from-secondary/40 via-secondary/20 to-transparent blur-2xl rounded-full" />
                <img
                  src={founderPhoto}
                  alt="Founder"
                  className="relative w-64 h-64 sm:w-72 sm:h-72 md:w-80 md:h-80 lg:w-96 lg:h-96 object-contain rounded-2xl shadow-2xl"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
