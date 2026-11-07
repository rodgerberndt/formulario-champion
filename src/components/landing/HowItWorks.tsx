import { motion } from "framer-motion";
import { useReveal } from "@/hooks/useReveal";
import { ShimmerText, KeywordGlow, LineReveal } from "./TextEffects";
import { useCopyNicho } from "@/config/nichoLanding";

/**
 * Uma coreografia só para os três passos (17/09/2026).
 *
 * Antes cada card entrava de um jeito: o primeiro deslizava da esquerda com
 * blur, o segundo subia com escala e o terceiro vinha da direita. Três
 * gramáticas diferentes na mesma lista é o que faz a página parecer feita aos
 * pedaços. Agora é a entrada padrão da página (aparece e sobe 24 px) com
 * stagger de 120 ms, e sem `filter: blur`, que é caro no celular.
 */
const ENTRADA = {
  initial: { opacity: 0, y: 24 },
  animate: { opacity: 1, y: 0 },
};

export function HowItWorks() {
  const { ref, isVisible } = useReveal(0.08);
  const { comoFunciona } = useCopyNicho();
  const steps = comoFunciona.passos;

  return (
    <section id="como-funciona" className="py-12 md:py-20 relative" ref={ref}>
      <div className="container mx-auto px-5 max-w-4xl">
        <div className={`text-center mb-10 reveal-up ${isVisible ? "visible" : ""}`}>
          <h2 className="text-foreground mb-2">
            <ShimmerText isVisible={isVisible}>{comoFunciona.tituloInicio}{"\u00A0"}</ShimmerText>
            <KeywordGlow>{comoFunciona.tituloDestaque}</KeywordGlow>
          </h2>
        </div>

        <div className="space-y-4 md:space-y-5">
          {steps.map((step, i) => (
            <motion.div
              key={i}
              initial={ENTRADA.initial}
              animate={isVisible ? ENTRADA.animate : {}}
              transition={{ delay: 0.1 + i * 0.12, duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
              className="gold-card"
            >
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0">
                  <div className="w-12 h-12 rounded-xl bg-secondary/15 border border-secondary/30 flex items-center justify-center">
                    <step.icone className="w-5 h-5 text-secondary" />
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-3 mb-1.5">
                    <span className="rotulo-micro text-secondary tabular-nums whitespace-nowrap">
                      Step {String(i + 1).padStart(2, "0")}
                    </span>
                    <span className="text-xs text-muted-foreground">{step.subtitulo}</span>
                  </div>
                  {/* Título em branco: o dourado do passo já está no rótulo
                      "STEP 01". E `.gold-text` pinta com
                      `-webkit-text-fill-color: transparent`, que some em
                      webview quando o gradiente não resolve. */}
                  <h3 className="text-foreground mb-2" style={{ fontSize: "1.25rem" }}>
                    {step.titulo}
                  </h3>
                  <ul className="space-y-1.5">
                    {step.bullets.map((b, j) => (
                      <LineReveal key={j} isVisible={isVisible} delay={250 + i * 150 + j * 80}>
                        <li className="flex items-start gap-2 text-sm text-muted-foreground">
                          <span className="w-1.5 h-1.5 rounded-full bg-secondary/50 mt-1.5 flex-shrink-0" />
                          {b}
                        </li>
                      </LineReveal>
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
