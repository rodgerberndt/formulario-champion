import { motion } from "framer-motion";
import { useReveal } from "@/hooks/useReveal";
import { ShimmerText, KeywordGlow } from "./TextEffects";

export function ClientFeedbacks() {
  const { ref, isVisible } = useReveal(0.08);

  return (
    <section ref={ref} className="py-16 md:py-24 relative bg-slate-800">
      <div className="container mx-auto px-5 max-w-6xl">
        <div className={`text-center mb-10 md:mb-14 reveal-up ${isVisible ? "visible" : ""}`}>
          <p className="text-xs md:text-sm font-bold tracking-[0.25em] text-secondary mb-4" style={{ fontFamily: "'Montserrat', sans-serif" }}>
            DEPOIMENTOS
          </p>
          <h2 className="text-foreground">
            <ShimmerText isVisible={isVisible}>CASES </ShimmerText>
            <KeywordGlow>REAIS</KeywordGlow>
          </h2>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.15 }}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
          className="rounded-2xl overflow-hidden border border-secondary/20 bg-primary/[0.04] shadow-lg shadow-secondary/5"
        >
          <img
            src="/proofs/cases-reais.png"
            alt="Prints de WhatsApp de clientes da Champion: Pedro Rivano, Isso é Champion (R$ 263.566 em 18 dias) e Bruno Martins (primeiro mês de assessoria)"
            loading="lazy"
            decoding="async"
            className="w-full h-auto object-contain"
          />
        </motion.div>
      </div>
    </section>
  );
}
