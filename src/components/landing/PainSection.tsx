import { motion } from "framer-motion";
import { TrendingDown, AlertTriangle, Skull } from "lucide-react";
import { useReveal } from "@/hooks/useReveal";
import { ShimmerText, KeywordGlow } from "./TextEffects";

const pains = [
  {
    icon: TrendingDown,
    title: "Morre na pré-escala",
    desc: "O criativo performou, mas quando você aumenta o orçamento, para de funcionar.",
  },
  {
    icon: AlertTriangle,
    title: "CPA sobe quando escala",
    desc: "Cada tentativa de escalar encarece o lead e corrói a margem.",
  },
  {
    icon: Skull,
    title: "Satura e ninguém sabe porquê",
    desc: "A frequência sobe, CTR despenca, e a conta volta pra estaca zero.",
  },
];

export function PainSection() {
  const { ref, isVisible } = useReveal(0.08);

  return (
    <section className="py-12 md:py-20 relative overflow-hidden" ref={ref}>
      <div className="container mx-auto px-5 max-w-5xl relative z-10">
        <div className={`text-center mb-8 reveal-up ${isVisible ? "visible" : ""}`}>
          <h2 className="text-foreground mb-2">
            <ShimmerText isVisible={isVisible}>
              O PROBLEMA NÃO É SUA OFERTA.{" "}
            </ShimmerText>
            <KeywordGlow>É CRIATIVO QUE NÃO SUSTENTA ESCALA.</KeywordGlow>
          </h2>
          <p className="text-sm text-muted-foreground max-w-xl mx-auto">
            A maioria dos anunciantes está presa no mesmo ciclo: criar, testar, falhar, repetir — sem método.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          {pains.map((pain, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 16 }}
              animate={isVisible ? { opacity: 1, y: 0 } : {}}
              transition={{ delay: 0.1 + i * 0.1, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
              className="gold-card"
            >
              <div className="w-10 h-10 rounded-xl bg-destructive/10 border border-destructive/20 flex items-center justify-center mb-3">
                <pain.icon className="w-5 h-5 text-destructive" />
              </div>
              <h3 className="text-foreground mb-1.5" style={{ fontSize: "1.25rem" }}>
                <KeywordGlow>{pain.title}</KeywordGlow>
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{pain.desc}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
