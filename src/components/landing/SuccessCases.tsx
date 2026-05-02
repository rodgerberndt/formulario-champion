import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Instagram, ChevronLeft, ChevronRight } from "lucide-react";
import { useReveal } from "@/hooks/useReveal";
import { ShimmerText, KeywordGlow } from "./TextEffects";
import danielMendes from "@/assets/cases/daniel-mendes.png";
import lucasBachur from "@/assets/cases/lucas-bachur.png";
import natanTebulozo from "@/assets/cases/natan-tebulozo.jpg";

type Case = {
  name: string;
  instagram: string;
  role: string;
  image: string;
  body: React.ReactNode;
};

const cases: Case[] = [
  {
    name: "NATHAN (TEBULOZO)",
    instagram: "@TEBULOZO",
    role: "Infoprodutor • Múltiplos 6 dígitos de faturamento",
    image: natanTebulozo,
    body: (
      <>
        Conhecido como <strong className="text-foreground">Tebulozo</strong> no mercado, Nathan é{" "}
        <strong className="text-foreground">infoprodutor</strong> e já ultrapassa{" "}
        <strong className="text-foreground">800k</strong> de faturamento. Nathan iniciou com a gente com
        a dor de que precisava de alguém para realmente conseguir delegar os criativos, e poder focar em
        novas operações, gerando mais escala para todas... e foi exatamente isso que aconteceu. No nosso
        primeiro mês faturamos <strong className="text-foreground">94k</strong>, faltou pouco para a
        plaquinha.
      </>
    ),
  },
  {
    name: "LUCAS BACHUR",
    instagram: "@BUSINESS.BACHUR",
    role: "Infoprodutor & Nutra +7D",
    image: lucasBachur,
    body: (
      <>
        Com apenas <strong className="text-foreground">15 anos</strong> já chegou a faturar mais{" "}
        <strong className="text-foreground">6 dígitos no mês</strong> com a gente{" "}
        <strong className="text-foreground">assessorando sua operação de Infoprodutos e Nutra na gringa</strong>,
        Bachur é conhecido entre os gigantes do mercado por escalar pesado com apenas 15 anos.
      </>
    ),
  },
  {
    name: "DANIEL MENDES",
    instagram: "@MENDESS.DANIELL",
    role: "CEO Imperial Pay & Bestseller Tribopay 2024",
    image: danielMendes,
    body: (
      <>
        Quando o Daniel chegou até nós, sofria muito com a{" "}
        <strong className="text-foreground">reprovação constante de criativos</strong>, já que atuava em{" "}
        <strong className="text-foreground">nichos mais pesados e black no Meta</strong>. Aplicamos uma{" "}
        <strong className="text-foreground">estratégia de criativos sob medida</strong> para esse cenário
        e elevamos drasticamente a <strong className="text-foreground">assertividade</strong> e a{" "}
        <strong className="text-foreground">taxa de aprovação</strong>, eliminando essa dor da operação e
        destravando a escala contínua e saudável.
      </>
    ),
  },
];

export function SuccessCases() {
  const { ref, isVisible } = useReveal(0.08);
  const [index, setIndex] = useState(0);
  const total = cases.length;
  const current = cases[index];

  const go = (dir: 1 | -1) => setIndex((i) => (i + dir + total) % total);

  return (
    <section id="success-cases" className="py-12 md:py-20 relative" ref={ref}>
      <div
        className={`absolute inset-0 pointer-events-none transition-opacity duration-700 ${isVisible ? "opacity-100" : "opacity-0"}`}
        style={{
          background:
            "radial-gradient(ellipse at center, hsl(42 90% 58% / 0.04) 0%, transparent 65%)",
        }}
      />

      <div className="container mx-auto px-5 max-w-5xl relative z-10">
        <div className={`text-center mb-8 reveal-up ${isVisible ? "visible" : ""}`}>
          <p className="text-xs uppercase tracking-[0.2em] text-secondary mb-2 font-semibold">
            Cases de Sucesso
          </p>
          <h2 className="text-foreground mb-2 text-2xl sm:text-3xl md:text-5xl leading-tight">
            <ShimmerText isVisible={isVisible}>QUEM JÁ TRABALHA COM A</ShimmerText>
            <br />
            <KeywordGlow>CHAMPION</KeywordGlow>
          </h2>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={isVisible ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          className="gold-card p-4 md:p-6 overflow-hidden"
        >
          <AnimatePresence mode="wait">
            <motion.div
              key={index}
              initial={{ opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -24 }}
              transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
              className="grid md:grid-cols-2 gap-5 md:gap-8 items-center"
            >
              <div className="relative rounded-2xl overflow-hidden bg-muted/10 aspect-[4/5] md:aspect-[3/4]">
                <img
                  src={current.image}
                  alt={`Foto de ${current.name}, case de sucesso da Champion`}
                  className="w-full h-full object-cover"
                  loading="lazy"
                  width={600}
                  height={800}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-background/40 via-transparent to-transparent pointer-events-none" />
              </div>

              <div className="flex flex-col">
                <div className="flex items-center gap-2 text-secondary mb-2">
                  <Instagram className="w-4 h-4" />
                  <span className="text-sm font-semibold tracking-wide">{current.instagram}</span>
                </div>
                <h3 className="text-foreground text-2xl md:text-3xl font-bold mb-1">
                  {current.name}
                </h3>
                <p className="text-sm text-muted-foreground mb-4">{current.role}</p>
                <p className="text-sm md:text-base text-muted-foreground leading-relaxed">
                  {current.body}
                </p>
              </div>
            </motion.div>
          </AnimatePresence>

          {/* Controls */}
          <div className="flex items-center justify-between mt-5 md:mt-6">
            <div className="flex items-center gap-1.5">
              {cases.map((_, i) => (
                <button
                  key={i}
                  type="button"
                  aria-label={`Ir para case ${i + 1}`}
                  onClick={() => setIndex(i)}
                  className={`rounded-full transition-all duration-300 ${
                    i === index
                      ? "w-6 h-2 bg-secondary"
                      : "w-2 h-2 bg-muted-foreground/40 hover:bg-muted-foreground/70"
                  }`}
                />
              ))}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => go(-1)}
                aria-label="Case anterior"
                className="w-10 h-10 rounded-full bg-card/80 border border-border/40 flex items-center justify-center text-foreground hover:bg-card transition-colors"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <button
                type="button"
                onClick={() => go(1)}
                aria-label="Próximo case"
                className="w-10 h-10 rounded-full bg-card/80 border border-border/40 flex items-center justify-center text-foreground hover:bg-card transition-colors"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
