import { Button } from "@/components/ui/button";
import { ArrowRight, CheckCircle, Users, Sparkles, TrendingUp } from "lucide-react";

interface HeroProps {
  onScrollToQuiz: () => void;
}

export function Hero({ onScrollToQuiz }: HeroProps) {
  return (
    <section className="min-h-[85vh] md:min-h-screen flex items-center justify-center pt-16 pb-20 md:pb-16 relative overflow-hidden">
      {/* Background Effects */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="hero-glow top-1/4 left-1/2 -translate-x-1/2" />
        <div className="absolute top-20 right-10 w-32 h-32 bg-secondary/5 rounded-full blur-2xl" />
        <div className="absolute bottom-40 left-10 w-24 h-24 bg-secondary/5 rounded-full blur-2xl" />
      </div>

      <div className="container mx-auto px-4 relative z-10">
        <div className="max-w-3xl mx-auto text-center">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-secondary/10 border border-secondary/20 mb-6 animate-fade-in">
            <Sparkles className="w-3.5 h-3.5 text-secondary" />
            <span className="text-xs text-secondary font-medium">
              Diagnóstico Gratuito · 2-4 minutos
            </span>
          </div>

          {/* Headline */}
          <h1 className="font-display text-3xl sm:text-4xl md:text-5xl lg:text-6xl champion-gradient-text mb-4 md:mb-5 animate-slide-up tracking-wider leading-tight">
            SE VOCÊ NÃO TESTA CRIATIVO TODA SEMANA NA SUA OPERAÇÃO, PODE ESTAR DEIXANDO MUITO DINHEIRO NA MESA.
          </h1>

          {/* Subheadline */}
          <p className="text-base md:text-lg text-muted-foreground max-w-xl mx-auto mb-6 animate-slide-up" style={{ animationDelay: "0.1s" }}>
            O criativo Champion que vai mudar o seu game.
          </p>

          {/* Bullets */}
          <div className="flex flex-col md:flex-row items-center justify-center gap-3 md:gap-6 mb-8 animate-slide-up" style={{ animationDelay: "0.2s" }}>
            <div className="flex items-center gap-2 text-foreground text-sm">
              <CheckCircle className="w-4 h-4 text-secondary" />
              <span>Diagnóstico do funil e oferta</span>
            </div>
            <div className="flex items-center gap-2 text-foreground text-sm">
              <CheckCircle className="w-4 h-4 text-secondary" />
              <span>Estratégia criativa</span>
            </div>
            <div className="flex items-center gap-2 text-foreground text-sm">
              <CheckCircle className="w-4 h-4 text-secondary" />
              <span>Playbook de WhatsApp</span>
            </div>
          </div>

          {/* CTA */}
          <div className="flex flex-col items-center justify-center gap-4 mb-10 animate-slide-up" style={{ animationDelay: "0.3s" }}>
            <Button
              variant="champion"
              size="xl"
              onClick={onScrollToQuiz}
              className="group cta-glow"
            >
              Começar Diagnóstico
              <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </Button>
          </div>

          {/* Micro Proofs */}
          <div className="flex flex-wrap items-center justify-center gap-4 md:gap-8 text-muted-foreground animate-fade-in" style={{ animationDelay: "0.4s" }}>
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-secondary" />
              <span className="text-xs md:text-sm">
                <strong className="text-foreground">[+X]</strong> clientes
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-secondary" />
              <span className="text-xs md:text-sm">
                <strong className="text-foreground">[+Y]</strong> criativos
              </span>
            </div>
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-secondary" />
              <span className="text-xs md:text-sm">
                <strong className="text-foreground">[3.7]</strong> ROI médio
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
