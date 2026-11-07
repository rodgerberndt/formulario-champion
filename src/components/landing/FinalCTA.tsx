import { motion } from "framer-motion";
import { Botao } from "./Botao";
import { useReveal } from "@/hooks/useReveal";
import { useCopyNicho } from "@/config/nichoLanding";
import { ShimmerText, KeywordGlow, LineReveal } from "./TextEffects";

interface FinalCTAProps {
  /**
   * Ação do botão. Desde 17/09/2026 a landing passa a função que registra o
   * clique e rola até o formulário do topo; o quiz deixou de ser o destino.
   */
  onStartClick: (buttonId: string) => void;
}

export function FinalCTA({ onStartClick }: FinalCTAProps) {
  const { ref, isVisible } = useReveal(0.08);
  const { ctaFinal } = useCopyNicho();

  return (
    <section id="cta-final" className="py-16 md:py-24 relative overflow-hidden" ref={ref}>
      {/* Convergence glow */}
      <div className="absolute inset-0 pointer-events-none">
        <div className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] rounded-full blur-[80px] transition-opacity duration-1000 ${isVisible ? "opacity-100" : "opacity-0"}`} style={{ background: "hsl(42 90% 58% / 0.06)" }} />
      </div>

      <div className="container mx-auto px-5 max-w-2xl relative z-10">
        <div className={`text-center reveal-up ${isVisible ? "visible" : ""}`}>
          <h2 className="text-foreground mb-3">
            <ShimmerText isVisible={isVisible}>{ctaFinal.tituloInicio}</ShimmerText>{" "}
            <KeywordGlow>{ctaFinal.tituloDestaque}</KeywordGlow>
          </h2>

          <LineReveal isVisible={isVisible} delay={200}>
            <p className="text-sm text-muted-foreground mb-8 max-w-md mx-auto">
              {ctaFinal.sub}
            </p>
          </LineReveal>

          {/* Os 4 passos viram uma linha numerada com hairline entre eles: o
              ícone em caixinha dourada repetido quatro vezes competia com o
              botão. Uma animação só para os quatro (stagger curto). */}
          <div className="grid grid-cols-2 gap-x-6 gap-y-0 mb-9 max-w-md mx-auto text-left">
            {ctaFinal.passos.map((passo, i) => (
              <motion.div
                key={passo}
                initial={{ opacity: 0, y: 12 }}
                animate={isVisible ? { opacity: 1, y: 0 } : {}}
                transition={{ delay: 0.25 + i * 0.08, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                className="flex items-start gap-3 py-3 border-t border-white/10"
              >
                <span className="rotulo-micro text-secondary/70 pt-px tabular-nums">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="text-xs text-muted-foreground leading-snug">{passo}</span>
              </motion.div>
            ))}
          </div>

          <LineReveal isVisible={isVisible} delay={560}>
            <Botao
              rotulo={ctaFinal.rotulo}
              tamanho="lg"
              blocoMobile
              onClick={() => onStartClick("final_cta")}
            />
          </LineReveal>
        </div>
      </div>
    </section>
  );
}
