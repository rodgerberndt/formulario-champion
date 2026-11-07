import { motion } from "framer-motion";
import { useReveal } from "@/hooks/useReveal";
import { ShimmerText, KeywordGlow } from "./TextEffects";
import { useCopyNicho } from "@/config/nichoLanding";

export function PainSection() {
  const { ref, isVisible } = useReveal(0.08);
  const { dor } = useCopyNicho();
  const pains = dor.itens;

  return (
    <section className="py-12 md:py-20 relative overflow-hidden" ref={ref}>
      <div className="container mx-auto px-5 max-w-6xl relative z-10">
        <div className={`text-center mb-8 reveal-up ${isVisible ? "visible" : ""}`}>
          <h2 className="text-foreground mb-2">
            <ShimmerText isVisible={isVisible}>{dor.tituloInicio}</ShimmerText>{" "}
            <KeywordGlow>{dor.tituloDestaque}</KeywordGlow>
          </h2>
          <p className="text-sm md:text-base text-muted-foreground max-w-2xl mx-auto">
            {dor.sub}
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {pains.map((pain, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 16 }}
              animate={isVisible ? { opacity: 1, y: 0 } : {}}
              transition={{ delay: 0.05 + i * 0.06, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
              className="gold-card"
            >
              {/* Índice em microcaixa-alta no lugar do rótulo dourado no
                  título: com 10 cartões, o título dourado em todos fazia o
                  dourado virar cor de texto e não destaque. */}
              <div className="flex items-center gap-3 mb-3">
                <div className="w-9 h-9 rounded-lg bg-destructive/10 border border-destructive/20 flex items-center justify-center shrink-0">
                  <pain.icone className="w-4 h-4 text-destructive" />
                </div>
                <span className="rotulo-micro text-secondary/70 tabular-nums">
                  {String(i + 1).padStart(2, "0")}
                </span>
              </div>
              <h3 className="text-foreground mb-1.5" style={{ fontSize: "1.15rem" }}>
                {pain.titulo}
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{pain.desc}</p>
            </motion.div>
          ))}
        </div>

        <div className={`mt-10 md:mt-14 text-center reveal-up ${isVisible ? "visible" : ""}`}>
          <p className="text-base md:text-xl font-semibold text-foreground max-w-3xl mx-auto leading-snug whitespace-pre-line">
            {"\n"}
          </p>
        </div>
      </div>
    </section>
  );
}
