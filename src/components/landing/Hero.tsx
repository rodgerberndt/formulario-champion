import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { ArrowRight, Users, Sparkles, TrendingUp, ClipboardCheck, BarChart3, PhoneCall, Rocket } from "lucide-react";
import { WordCascade, KeywordGlow, LineReveal } from "./TextEffects";
import founderPhoto from "@/assets/founder-photo.png";

interface HeroProps {
  onStartClick?: () => void;
}

const heroSteps = [
  { icon: ClipboardCheck, text: "Preencha o quiz" },
  { icon: BarChart3, text: "Diagnóstico" },
  { icon: PhoneCall, text: "Especialista liga" },
  { icon: Rocket, text: "Plano de ação" },
];

export function Hero({ onStartClick }: HeroProps) {
  const [isVisible, setIsVisible] = useState(false);
  useEffect(() => { const t = setTimeout(() => setIsVisible(true), 100); return () => clearTimeout(t); }, []);

  return (
    <section className="min-h-[80vh] md:min-h-screen flex items-center justify-center pt-16 pb-16 md:pb-12 relative overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="hero-glow top-1/4 left-1/2 -translate-x-1/2" />
        <div className="hidden md:block absolute top-20 right-10 w-32 h-32 bg-secondary/8 rounded-full blur-2xl" />
        <div className="hidden md:block absolute bottom-40 left-10 w-24 h-24 bg-secondary/6 rounded-full blur-2xl" />
      </div>

      <div className="container mx-auto px-5 relative z-10">
        <div className="max-w-2xl mx-auto">
          <div className="grid md:grid-cols-2 gap-8 md:gap-10 items-center">
            {/* Content */}
            <div className="text-center md:text-left order-2 md:order-1">
              {/* Badge */}
              <LineReveal isVisible={isVisible} delay={0}>
                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-secondary/12 border border-secondary/25 mb-5">
                  <Sparkles className="w-3.5 h-3.5 text-secondary" />
                  <span className="text-xs text-secondary font-medium">
                    Diagnóstico gratuito de 2 minutos
                  </span>
                </div>
              </LineReveal>

              {/* Headline with word cascade */}
              <h1 className="font-bold text-foreground mb-4 leading-tight text-4xl">
                <WordCascade
                  text="SE VOCÊ NÃO TESTA CRIATIVO TODA SEMANA,"
                  isVisible={isVisible}
                  stagger={45}
                  baseDelay={100}
                />
                {" "}
                <KeywordGlow>
                  <WordCascade
                    text="PODE ESTAR DEIXANDO MUITO DINHEIRO NA MESA."
                    isVisible={isVisible}
                    stagger={45}
                    baseDelay={500}
                  />
                </KeywordGlow>
              </h1>

              {/* Subheadline */}
              <LineReveal isVisible={isVisible} delay={900}>
                <p className="text-sm md:text-base text-muted-foreground max-w-sm mx-auto md:mx-0 mb-6">
                  C.G.S , o sistema de crescimento da Champion pode te ajudar.
                  <br />​
                </p>
              </LineReveal>

              {/* CTA */}
              <LineReveal isVisible={isVisible} delay={1100}>
                <div className="flex flex-col items-center md:items-start gap-4 mb-6">
                  <Button size="lg" onClick={onStartClick} className="group h-12 md:h-14 px-6 md:px-8 text-sm md:text-base font-semibold bg-primary hover:bg-primary/90 text-primary-foreground rounded-2xl shadow-xl shadow-primary/25 hover:shadow-2xl hover:shadow-primary/35 transition-shadow duration-200 active:scale-[0.98]">
                    FAZER DIAGNÓSTICO (2 MIN)
                    <ArrowRight className="w-4 h-4 md:w-5 md:h-5 ml-2 group-hover:translate-x-1 transition-transform" />
                  </Button>
                </div>
              </LineReveal>

              {/* Step-by-step mini */}
              <div className="flex items-center gap-1 md:gap-2 mb-6 justify-center md:justify-start">
                {heroSteps.map((step, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, y: 8 }}
                    animate={isVisible ? { opacity: 1, y: 0 } : {}}
                    transition={{ delay: 1.3 + i * 0.1, duration: 0.4 }}
                    className="flex items-center gap-1"
                  >
                    <div className="w-6 h-6 md:w-7 md:h-7 rounded-lg bg-secondary/10 border border-secondary/20 flex items-center justify-center flex-shrink-0">
                      <step.icon className="w-3 h-3 md:w-3.5 md:h-3.5 text-secondary" />
                    </div>
                    <span className="text-[10px] md:text-xs text-muted-foreground font-medium hidden sm:inline">{step.text}</span>
                    {i < heroSteps.length - 1 && (
                      <div className="w-3 md:w-5 h-px bg-border/40 mx-0.5" />
                    )}
                  </motion.div>
                ))}
              </div>

              {/* Micro Proofs */}
              <LineReveal isVisible={isVisible} delay={1600}>
                <div className="flex flex-wrap items-center justify-center md:justify-start gap-4 md:gap-6 text-muted-foreground">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded-lg bg-secondary/12">
                      <Users className="w-3.5 h-3.5 text-secondary" />
                    </div>
                    <span className="text-xs">
                      <strong className="text-foreground font-semibold">+ de 1.1k</strong> clientes
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded-lg bg-secondary/12">
                      <Sparkles className="w-3.5 h-3.5 text-secondary" />
                    </div>
                    <span className="text-xs">
                      <strong className="text-foreground font-semibold">+ de 8k</strong> criativos
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded-lg bg-secondary/12">
                      <TrendingUp className="w-3.5 h-3.5 text-secondary" />
                    </div>
                    <span className="text-xs">
                      <strong className="text-foreground font-semibold">3.7</strong> ROI médio
                    </span>
                  </div>
                </div>
              </LineReveal>
            </div>

            {/* Photo */}
            <div className="flex justify-center md:justify-end order-1 md:order-2">
              <LineReveal isVisible={isVisible} delay={200}>
                <div className="relative">
                  <div className="hidden md:block absolute -inset-4 bg-secondary/15 blur-2xl rounded-full" />
                  <img src={founderPhoto} alt="Founder" className="relative w-56 h-56 sm:w-64 sm:h-64 md:w-80 md:h-80 lg:w-96 lg:h-96 object-contain" loading="eager" decoding="async" />
                </div>
              </LineReveal>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
