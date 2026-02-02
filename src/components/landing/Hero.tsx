import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowRight, Users, Sparkles, TrendingUp, Trophy } from "lucide-react";
import founderPhoto from "@/assets/founder-photo.png";

export function Hero() {
  const navigate = useNavigate();

  return (
    <section className="min-h-[85vh] md:min-h-screen flex items-center justify-center pt-16 pb-20 md:pb-12 relative overflow-hidden">
      {/* Background Effects */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="hero-glow top-1/4 left-1/2 -translate-x-1/2" />
        <div className="absolute top-20 right-10 w-40 h-40 bg-primary/5 dark:bg-secondary/5 rounded-full blur-3xl" />
        <div className="absolute bottom-40 left-10 w-32 h-32 bg-primary/5 dark:bg-secondary/5 rounded-full blur-3xl" />
        
        {/* Floating Trophies */}
        <Trophy className="absolute top-[15%] left-[8%] w-8 h-8 text-primary/15 dark:text-secondary/20 animate-float" style={{ animationDelay: "0s" }} />
        <Trophy className="absolute top-[25%] right-[12%] w-6 h-6 text-primary/10 dark:text-secondary/15 animate-float" style={{ animationDelay: "1s" }} />
        <Trophy className="absolute top-[60%] left-[5%] w-10 h-10 text-primary/8 dark:text-secondary/10 animate-float" style={{ animationDelay: "2s" }} />
        <Trophy className="absolute top-[70%] right-[8%] w-7 h-7 text-primary/15 dark:text-secondary/20 animate-float" style={{ animationDelay: "0.5s" }} />
        <Trophy className="absolute top-[40%] left-[15%] w-5 h-5 text-primary/10 dark:text-secondary/15 animate-float" style={{ animationDelay: "1.5s" }} />
        <Trophy className="absolute top-[50%] right-[20%] w-9 h-9 text-primary/8 dark:text-secondary/10 animate-float" style={{ animationDelay: "2.5s" }} />
      </div>

      <div className="container mx-auto px-4 relative z-10">
        <div className="max-w-5xl mx-auto">
          <div className="grid md:grid-cols-2 gap-10 md:gap-12 items-center">
            {/* Content */}
            <div className="text-center md:text-left order-2 md:order-1">
              {/* Badge */}
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 dark:bg-secondary/10 border border-primary/20 dark:border-secondary/20 mb-6 animate-fade-in">
                <Sparkles className="w-4 h-4 text-primary dark:text-secondary" />
                <span className="text-sm text-primary dark:text-secondary font-medium">
                  Diagnóstico gratuito de 2 minutos
                </span>
              </div>

              {/* Headline */}
              <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold text-foreground mb-5 animate-slide-up leading-tight">
                SE VOCÊ NÃO TESTA CRIATIVO TODA SEMANA,{" "}
                <span className="champion-gradient-text">
                  PODE ESTAR DEIXANDO DINHEIRO NA MESA.
                </span>
              </h1>

              {/* Subheadline */}
              <p className="text-base md:text-lg text-muted-foreground max-w-md mx-auto md:mx-0 mb-8 animate-slide-up" style={{ animationDelay: "0.1s" }}>
                O criativo Champion que vai mudar o seu game.<br />
                Diagnóstico gratuito de 2 minutos.
              </p>

              {/* CTA */}
              <div className="flex flex-col items-center md:items-start gap-4 mb-10 animate-slide-up" style={{ animationDelay: "0.2s" }}>
                <Button
                  size="lg"
                  onClick={() => navigate("/quiz")}
                  className="group h-14 px-8 text-base font-semibold bg-primary hover:bg-primary/90 text-primary-foreground rounded-2xl shadow-xl shadow-primary/25 hover:shadow-2xl hover:shadow-primary/35 transition-all duration-300 active:scale-[0.98]"
                >
                  FAZER DIAGNÓSTICO (2 MIN)
                  <ArrowRight className="w-5 h-5 ml-2 group-hover:translate-x-1 transition-transform" />
                </Button>
              </div>

              {/* Micro Proofs */}
              <div className="flex flex-wrap items-center justify-center md:justify-start gap-5 md:gap-8 text-muted-foreground animate-fade-in" style={{ animationDelay: "0.3s" }}>
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-lg bg-primary/10 dark:bg-secondary/10">
                    <Users className="w-4 h-4 text-primary dark:text-secondary" />
                  </div>
                  <span className="text-sm">
                    <strong className="text-foreground font-semibold">+ de 1.1k</strong> clientes
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-lg bg-primary/10 dark:bg-secondary/10">
                    <Sparkles className="w-4 h-4 text-primary dark:text-secondary" />
                  </div>
                  <span className="text-sm">
                    <strong className="text-foreground font-semibold">+ de 8k</strong> criativos
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-lg bg-primary/10 dark:bg-secondary/10">
                    <TrendingUp className="w-4 h-4 text-primary dark:text-secondary" />
                  </div>
                  <span className="text-sm">
                    <strong className="text-foreground font-semibold">3.7</strong> ROI médio
                  </span>
                </div>
              </div>
            </div>

            {/* Photo */}
            <div className="flex justify-center md:justify-end order-1 md:order-2 animate-fade-in">
              <div className="relative">
                {/* Glow behind photo */}
                <div className="absolute -inset-6 bg-primary/20 dark:bg-secondary/30 blur-3xl rounded-full animate-pulse-slow" />
                <div className="absolute -inset-3 bg-gradient-to-br from-primary/30 dark:from-secondary/40 via-primary/15 dark:via-secondary/20 to-transparent blur-2xl rounded-full" />
                <img
                  src={founderPhoto}
                  alt="Founder"
                  className="relative w-72 h-72 sm:w-80 sm:h-80 md:w-96 md:h-96 lg:w-[28rem] lg:h-[28rem] object-contain drop-shadow-2xl"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
