import { motion } from "framer-motion";
import { ShieldCheck } from "lucide-react";
import { useReveal } from "@/hooks/useReveal";
import { ShimmerText } from "./TextEffects";
import { useCopyNicho } from "@/config/nichoLanding";

/**
 * Garantia do primeiro mês (28/09/2026).
 *
 * É a prova nº 5 do capítulo das 18 provas: garantia escrita como sinal de que
 * quem vende confia, e não como política de reembolso. Por isso ela tem nome
 * próprio, mora numa seção só dela e vem logo depois dos cases: quem acabou
 * de ver os números está no ponto exato do "sei, tá bom", e é aí que a prova
 * precisa aparecer.
 *
 * Só renderiza quando o nicho traz `garantia`; as outras versões da página
 * continuam sem esta seção e sem o `data-track-id` dela.
 */
export function GarantiaSection() {
  const { ref, isVisible } = useReveal(0.1);
  const { garantia } = useCopyNicho();
  if (!garantia) return null;

  return (
    <section className="py-12 md:py-20 relative" ref={ref}>
      <div className="container mx-auto px-5 max-w-3xl">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={isVisible ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
          className="gold-card"
        >
          <div className="flex items-center gap-3 mb-4">
            <div className="w-11 h-11 rounded-xl bg-secondary/15 border border-secondary/30 flex items-center justify-center shrink-0">
              <ShieldCheck className="w-5 h-5 text-secondary" />
            </div>
            <span className="rotulo-micro text-secondary">{garantia.nome}</span>
          </div>

          <h2 className="text-foreground mb-5 leading-tight" style={{ fontSize: "1.5rem" }}>
            <ShimmerText isVisible={isVisible}>{garantia.titulo}</ShimmerText>
          </h2>

          <div className="space-y-3">
            {garantia.corpo.map((linha, i) => (
              <p key={i} className="text-sm md:text-base text-muted-foreground leading-relaxed">
                {linha}
              </p>
            ))}
          </div>

          {garantia.nota && (
            <p className="mt-5 text-xs text-muted-foreground/80 border-t border-white/10 pt-4">
              {garantia.nota}
            </p>
          )}
        </motion.div>
      </div>
    </section>
  );
}
