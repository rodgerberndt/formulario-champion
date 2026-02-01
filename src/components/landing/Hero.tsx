import { Button } from "@/components/ui/button";
import { ArrowRight, Play, CheckCircle, Users, Sparkles, TrendingUp } from "lucide-react";

interface HeroProps {
  onScrollToQuiz: () => void;
  onScrollToProcess: () => void;
}

export function Hero({ onScrollToQuiz, onScrollToProcess }: HeroProps) {
  return (
    <section className="min-h-screen flex items-center justify-center pt-20 pb-32 md:pb-20 relative overflow-hidden">
      {/* Background Effects */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-secondary/5 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-primary/10 rounded-full blur-3xl" />
      </div>

      <div className="container mx-auto px-4 relative z-10">
        <div className="max-w-4xl mx-auto text-center">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-secondary/10 border border-secondary/20 mb-8 animate-fade-in">
            <Sparkles className="w-4 h-4 text-secondary" />
            <span className="text-sm text-secondary font-medium">
              Diagnóstico Gratuito · 2-4 minutos
            </span>
          </div>

          {/* Headline */}
          <h1 className="font-display text-4xl sm:text-5xl md:text-6xl lg:text-7xl champion-gradient-text mb-6 animate-slide-up tracking-wider leading-tight">
            TRANSFORME FUNIL + CRIATIVO + WHATSAPP EM UMA MÁQUINA DE VENDAS PREVISÍVEL
          </h1>

          {/* Subheadline */}
          <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto mb-8 animate-slide-up" style={{ animationDelay: "0.1s" }}>
            Responda o diagnóstico (2–4 min) e receba um plano claro do que destrava seu ROI e suas vendas.
          </p>

          {/* Bullets */}
          <div className="flex flex-col md:flex-row items-center justify-center gap-4 md:gap-8 mb-10 animate-slide-up" style={{ animationDelay: "0.2s" }}>
            <div className="flex items-center gap-2 text-foreground">
              <CheckCircle className="w-5 h-5 text-secondary" />
              <span>Diagnóstico do funil e oferta</span>
            </div>
            <div className="flex items-center gap-2 text-foreground">
              <CheckCircle className="w-5 h-5 text-secondary" />
              <span>Estratégia criativa</span>
            </div>
            <div className="flex items-center gap-2 text-foreground">
              <CheckCircle className="w-5 h-5 text-secondary" />
              <span>Playbook de WhatsApp</span>
            </div>
          </div>

          {/* Qualifier */}
          <p className="text-sm text-muted-foreground mb-8 animate-slide-up" style={{ animationDelay: "0.25s" }}>
            Exclusivo para negócios que já testam tráfego ou querem escalar com previsibilidade.
          </p>

          {/* CTAs */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-12 animate-slide-up" style={{ animationDelay: "0.3s" }}>
            <Button
              variant="champion"
              size="xl"
              onClick={onScrollToQuiz}
              className="group"
            >
              Começar Diagnóstico
              <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </Button>
            <Button
              variant="championOutline"
              size="lg"
              onClick={onScrollToProcess}
              className="group"
            >
              <Play className="w-4 h-4" />
              Ver como funciona
            </Button>
          </div>

          {/* Micro Proofs */}
          <div className="flex flex-wrap items-center justify-center gap-6 md:gap-10 text-muted-foreground animate-fade-in" style={{ animationDelay: "0.4s" }}>
            <div className="flex items-center gap-2">
              <Users className="w-5 h-5 text-secondary" />
              <span className="text-sm">
                <strong className="text-foreground">[+X]</strong> clientes atendidos
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-secondary" />
              <span className="text-sm">
                <strong className="text-foreground">[+Y]</strong> criativos entregues
              </span>
            </div>
            <div className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-secondary" />
              <span className="text-sm">
                <strong className="text-foreground">[+Z]</strong> em mídia analisada
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
