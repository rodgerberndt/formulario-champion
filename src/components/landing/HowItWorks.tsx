import { ClipboardCheck, Zap, TrendingUp } from "lucide-react";
import { motion } from "framer-motion";
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
    title: "Produção + Esteira Semanal",
    subtitle: "Criativos toda semana",
    bullets: [
      "Novos criativos semanais baseados em dados e ângulos validados",
      "Testes estruturados (A/B/C) com otimização contínua",
      "Cada peça é desenhada pra performar — não pra enfeitar",
    ],
  },
  {
    icon: TrendingUp,
    title: "Escala e Otimização",
    subtitle: "Resultados previsíveis",
    bullets: [
      "Identificamos o criativo vencedor e escalamos com segurança",
      "Otimização por métricas reais: CPA, ROAS, CTR, frequência",
      "Rotina de testes que mantém a conta saudável e previsível",
    ],
  },
];

export function HowItWorks() {
  const { ref, isVisible } = useReveal(0.08);

  return (
    <section id="como-funciona" className="py-12 md:py-20 relative" ref={ref}>
      <div className="container mx-auto px-5 max-w-4xl">
        <div className={`text-center mb-10 reveal-up ${isVisible ? "visible" : ""}`}>
          <h2 className="text-foreground mb-2">
            COMO <span className="gold-text">FUNCIONA</span>
          </h2>
        </div>

        <div className="space-y-4 md:space-y-5">
          {steps.map((step, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 16 }}
              animate={isVisible ? { opacity: 1, y: 0 } : {}}
              transition={{ delay: 0.15 + i * 0.12, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
              className="gold-card"
            >
              <div className="flex items-start gap-4">
                {/* Step number + icon */}
                <div className="flex-shrink-0">
                  <div className="w-12 h-12 rounded-xl bg-secondary/15 border border-secondary/30 flex items-center justify-center">
                    <step.icon className="w-5 h-5 text-secondary" />
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2 mb-1">
                    <span className="text-xs font-bold text-secondary" style={{ fontFamily: "'Montserrat', sans-serif" }}>
                      STEP {i + 1}
                    </span>
                    <span className="text-xs text-muted-foreground">— {step.subtitle}</span>
                  </div>
                  <h3 className="gold-text mb-2" style={{ fontSize: "1.25rem" }}>
                    {step.title}
                  </h3>
                  <ul className="space-y-1.5">
                    {step.bullets.map((b, j) => (
                      <li key={j} className="flex items-start gap-2 text-sm text-muted-foreground">
                        <span className="w-1.5 h-1.5 rounded-full bg-secondary/50 mt-1.5 flex-shrink-0" />
                        {b}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
