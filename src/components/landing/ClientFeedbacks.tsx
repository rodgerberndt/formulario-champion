import { motion } from "framer-motion";
import { useReveal } from "@/hooks/useReveal";
import { ShimmerText, KeywordGlow } from "./TextEffects";

const feedbacks = [
  {
    src: "/proofs/depoimento-ganchos.webp",
    alt: "Print mostrando ROAS diferente apenas mudando o gancho do criativo",
    caption: "Mesma estrutura. Só muda o GANCHO. Olha a diferença de ROAS.",
  },
  {
    src: "/proofs/feedback-matheus.webp",
    alt: "Feedback de cliente com métricas reais",
    caption: "Formatos e ângulos diferentes = leitura diferente do Meta.",
  },
];

export function ClientFeedbacks() {
  const { ref, isVisible } = useReveal(0.08);

  return (
    <section ref={ref} className="py-16 md:py-24 relative">
      <div className="container mx-auto px-5 max-w-6xl">
        <div className={`text-center mb-10 md:mb-14 reveal-up ${isVisible ? "visible" : ""}`}>
          <p className="text-xs md:text-sm font-bold tracking-[0.25em] text-secondary mb-4" style={{ fontFamily: "'Montserrat', sans-serif" }}>
            FEEDBACKS
          </p>
          <h2 className="text-foreground">
            <ShimmerText isVisible={isVisible}>O que nossos clientes </ShimmerText>
            <KeywordGlow>estão dizendo</KeywordGlow>
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 md:gap-6">
          {feedbacks.map((f, i) => (
            <motion.div
              key={f.src}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.2 }}
              transition={{ delay: i * 0.1, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
              className="rounded-2xl border border-secondary/20 bg-primary/[0.04] p-3 md:p-4 shadow-lg shadow-secondary/5 hover:border-secondary/40 transition-colors"
            >
              <div className="overflow-hidden rounded-xl">
                <img
                  src={f.src}
                  alt={f.alt}
                  loading="lazy"
                  decoding="async"
                  className="w-full h-auto object-cover"
                />
              </div>
              <p className="text-xs md:text-sm text-muted-foreground mt-3 text-center leading-relaxed">
                {f.caption}
              </p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
