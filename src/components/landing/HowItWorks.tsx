import { useRef, useState, useEffect } from "react";
import { ClipboardCheck, Zap, TrendingUp } from "lucide-react";
import { useReveal } from "@/hooks/useReveal";

const steps = [
  {
    icon: ClipboardCheck,
    title: "Diagnóstico",
    subtitle: "Quiz + entendimento",
    bullets: [
      "Preencha o quiz de 2 minutos",
      "Nosso time analisa seu cenário, mercado e criativo atual",
      "Você recebe um plano personalizado com os próximos passos",
    ],
  },
  {
    icon: Zap,
    title: "Produção + Testes",
    subtitle: "Esteira semanal",
    bullets: [
      "Novos criativos semanais baseados em dados e ângulos validados",
      "Testes estruturados (A/B/C) com otimização contínua",
      "Cada peça é desenhada pra performar — não pra enfeitar",
    ],
  },
  {
    icon: TrendingUp,
    title: "Escala",
    subtitle: "Otimização por dados",
    bullets: [
      "Identificamos o criativo vencedor e escalamos com segurança",
      "Otimização por métricas reais: CPA, ROAS, CTR, frequência",
      "Rotina de testes que mantém a conta saudável e previsível",
    ],
  },
];

export function HowItWorks() {
  const { ref, isVisible } = useReveal(0.1);
  const sectionRef = useRef<HTMLDivElement>(null);
  const [activeStep, setActiveStep] = useState(0);

  useEffect(() => {
    const handleScroll = () => {
      const el = sectionRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const progress = Math.max(0, Math.min(1, -rect.top / (rect.height - window.innerHeight)));
      setActiveStep(Math.min(2, Math.floor(progress * 3)));
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <section id="como-funciona" className="relative" ref={ref}>
      <div ref={sectionRef} className="min-h-[200vh]">
        <div className="sticky top-0 min-h-screen flex items-center py-20">
          <div className="container mx-auto px-5 max-w-5xl">
            <div className={`text-center mb-12 reveal-up ${isVisible ? "visible" : ""}`}>
              <h2 className="text-foreground mb-3">
                COMO <span className="gold-text">FUNCIONA</span>
              </h2>
            </div>

            <div className="grid lg:grid-cols-2 gap-10 items-start">
              {/* Left – Progress + Steps */}
              <div className="space-y-6">
                {/* Progress bar */}
                <div className="flex gap-2 mb-8">
                  {steps.map((_, i) => (
                    <div key={i} className="flex-1 h-1 rounded-full overflow-hidden bg-muted/30">
                      <div
                        className="h-full rounded-full transition-all duration-700 ease-out"
                        style={{
                          width: i <= activeStep ? "100%" : "0%",
                          background: "linear-gradient(90deg, hsl(42 90% 58%), hsl(42 80% 68%))",
                        }}
                      />
                    </div>
                  ))}
                </div>

                {steps.map((step, i) => (
                  <div
                    key={i}
                    className={`gold-card transition-all duration-500 ${
                      i === activeStep
                        ? "border-secondary/40 scale-100 opacity-100"
                        : "opacity-40 scale-[0.97]"
                    }`}
                  >
                    <div className="flex items-center gap-3 mb-3">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors duration-500 ${
                        i === activeStep ? "bg-secondary/15 border border-secondary/30" : "bg-muted/20 border border-border/20"
                      }`}>
                        <step.icon className={`w-5 h-5 transition-colors duration-500 ${
                          i === activeStep ? "text-secondary" : "text-muted-foreground"
                        }`} />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-foreground" style={{ fontFamily: "'Montserrat', sans-serif" }}>
                          Step {i + 1}
                        </p>
                        <p className="text-xs text-muted-foreground">{step.subtitle}</p>
                      </div>
                    </div>
                    <h3
                      className={`mb-2 transition-colors duration-500 ${
                        i === activeStep ? "gold-text" : "text-muted-foreground"
                      }`}
                      style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: "1.5rem" }}
                    >
                      {step.title}
                    </h3>
                    {i === activeStep && (
                      <ul className="space-y-2 mt-3">
                        {step.bullets.map((b, j) => (
                          <li key={j} className="flex items-start gap-2 text-sm text-muted-foreground">
                            <span className="w-1.5 h-1.5 rounded-full bg-secondary/60 mt-1.5 flex-shrink-0" />
                            {b}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              </div>

              {/* Right – Visual indicator */}
              <div className="hidden lg:flex items-center justify-center">
                <div className="relative w-72 h-72">
                  {/* Big number */}
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span
                      className="text-[10rem] font-bold gold-text opacity-10"
                      style={{ fontFamily: "'Bebas Neue', sans-serif" }}
                    >
                      {activeStep + 1}
                    </span>
                  </div>
                  {/* Icon */}
                  <div className="absolute inset-0 flex items-center justify-center">
                    {(() => {
                      const StepIcon = steps[activeStep].icon;
                      return (
                        <div className="w-20 h-20 rounded-2xl bg-secondary/10 border border-secondary/30 flex items-center justify-center shadow-[0_0_40px_-10px_hsl(42_90%_58%/0.3)]">
                          <StepIcon className="w-10 h-10 text-secondary" />
                        </div>
                      );
                    })()}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
