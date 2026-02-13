import { motion } from "framer-motion";
import { TrendingDown, AlertTriangle, Skull } from "lucide-react";
import { useReveal } from "@/hooks/useReveal";

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
  const { ref, isVisible } = useReveal(0.15);

  return (
    <section className="py-16 md:py-24 relative overflow-hidden" ref={ref}>
      {/* Noise / smoke overlay */}
      <div
        className={`absolute inset-0 pointer-events-none transition-opacity duration-1000 ${isVisible ? "opacity-100" : "opacity-0"}`}
        style={{
          background: "radial-gradient(ellipse at center, hsl(0 0% 8% / 0.6) 0%, transparent 70%)",
        }}
      />

      <div className="container mx-auto px-5 max-w-5xl relative z-10">
        <div className={`text-center mb-12 reveal-up ${isVisible ? "visible" : ""}`}>
          <h2 className="text-foreground mb-3">
            O PROBLEMA NÃO É TRÁFEGO.{" "}
            <span className="gold-text">É CRIATIVO QUE NÃO SUSTENTA.</span>
          </h2>
          <p className="text-muted-foreground max-w-xl mx-auto">
            A maioria dos anunciantes está presa no mesmo ciclo: criar, testar, falhar, repetir — sem método.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-5">
          {pains.map((pain, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 30 }}
              animate={isVisible ? { opacity: 1, y: 0 } : {}}
              transition={{ delay: 0.2 + i * 0.15, duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
              className="gold-card group hover:scale-[1.02] transition-transform duration-300"
            >
              <div className="w-12 h-12 rounded-xl bg-destructive/10 border border-destructive/20 flex items-center justify-center mb-4 group-hover:bg-destructive/15 transition-colors">
                <pain.icon className="w-5 h-5 text-destructive" />
              </div>
              <h3 className="text-foreground mb-2" style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: "1.5rem" }}>
                {pain.title}
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{pain.desc}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
