import { motion } from "framer-motion";
import { useReveal } from "@/hooks/useReveal";
import { useCopyNicho } from "@/config/nichoLanding";

/**
 * Quem atende (28/09/2026).
 *
 * Prova nº 10 (autoridade: confiamos em pessoas, não em logos) e nº 11
 * (existe gente do outro lado). Sete páginas do gênero foram dissecadas e
 * três blocos atacam o vazamento entre lead e reunião; este é o mais barato.
 *
 * Sem foto de banco de imagem, nunca: enquanto a foto real não chega, o
 * avatar é a inicial do nome. Só renderiza quando o nicho traz `quemAtende`.
 */
export function QuemAtende() {
  const { ref, isVisible } = useReveal(0.1);
  const { quemAtende } = useCopyNicho();
  if (!quemAtende) return null;

  const inicial = quemAtende.nome.trim().charAt(0).toUpperCase();

  return (
    <section className="py-12 md:py-20 relative" ref={ref}>
      <div className="container mx-auto px-5 max-w-3xl">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={isVisible ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
          className="gold-card"
        >
          <div className="flex items-center gap-4 mb-5">
            {quemAtende.foto ? (
              <img
                src={quemAtende.foto}
                alt={quemAtende.nome}
                className="w-16 h-16 rounded-full object-cover border border-secondary/30 shrink-0"
                loading="lazy"
              />
            ) : (
              <div className="w-16 h-16 rounded-full bg-secondary/15 border border-secondary/30 flex items-center justify-center shrink-0">
                <span className="text-2xl font-semibold text-secondary">{inicial}</span>
              </div>
            )}
            <div className="min-w-0">
              <p className="rotulo-micro text-secondary mb-1">Quem te atende</p>
              <h2 className="text-foreground leading-tight" style={{ fontSize: "1.35rem" }}>
                {quemAtende.nome}
              </h2>
              <p className="text-xs md:text-sm text-muted-foreground">{quemAtende.cargo}</p>
            </div>
          </div>

          <div className="space-y-3">
            {quemAtende.linhas.map((linha, i) => (
              <p key={i} className="text-sm md:text-base text-muted-foreground leading-relaxed">
                {linha}
              </p>
            ))}
          </div>

          {quemAtende.prazo && (
            <p className="mt-5 text-sm text-foreground/90 border-t border-white/10 pt-4">
              {quemAtende.prazo}
            </p>
          )}
        </motion.div>
      </div>
    </section>
  );
}
