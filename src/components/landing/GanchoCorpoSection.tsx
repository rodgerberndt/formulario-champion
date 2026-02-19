import { useState } from "react";
import { motion } from "framer-motion";
import { useReveal } from "@/hooks/useReveal";
import { ShimmerText, KeywordGlow, LineReveal } from "./TextEffects";
import { Button } from "@/components/ui/button";
import { ArrowRight, Trophy } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useTracking } from "@/hooks/useTracking";

/* ── narrative lines with keyword markup ── */
const narrativeLines = [
  {
    text: "A Champion entendeu que depois do Andrômeda, criativos pro Meta que não estivessem se comunicando com ",
    highlights: [{ word: "FATIAS DE PÚBLICO DIFERENTES", type: "fatias" as const }],
    suffix: ", não iriam escalar,",
  },
  {
    text: "e talvez, nem minimamente performar a ponto de passar da pré-escala.",
    highlights: [],
    suffix: "",
  },
  {
    text: "O que a Champion entendeu, é que quando a gente tem formatos, ângulos, e ",
    highlights: [{ word: "PERSONAS", type: "persona" as const }],
    suffix: " diferentes nos criativos, tudo muda,",
  },
  {
    text: "nossos testes podem ser muito assertivos: ",
    highlights: [{ word: "33% de acerto", type: "badge" as const }],
    suffix: "…",
  },
  {
    text: "principalmente pelo fato de trabalharmos com cada ",
    highlights: [
      { word: "CORPO", type: "corpo" as const },
      { word: "4 GANCHOS", type: "gancho" as const },
    ],
    suffix: ", veja um exemplo:",
  },
  {
    text: "A resposta é simples, ",
    highlights: [{ word: "PERSONAS", type: "persona" as const }],
    suffix: ".",
  },
  {
    text: "Na estratégia da Champion de criativos, cada ",
    highlights: [{ word: "GANCHO", type: "gancho" as const }],
    suffix: " bate em uma persona do seu público diferente,",
  },
  {
    text: "e é isso que faz total diferente nos resultados de nossos clientes.",
    highlights: [],
    suffix: "",
  },
];

/* ── hook cards data ── */
const hookCards = [
  { id: 1, roas: "0.31", winner: false },
  { id: 2, roas: "3.30", winner: true },
  { id: 3, roas: "0", winner: false },
  { id: 4, roas: "0.49", winner: false },
];

/* ── keyword classes ── */
function KeywordSpan({ word, type }: { word: string; type: "gancho" | "corpo" | "fatias" | "persona" | "badge" }) {
  if (type === "gancho") {
    return <span className="gancho-keyword">{word}</span>;
  }
  if (type === "corpo") {
    return <span className="corpo-keyword">{word}</span>;
  }
  if (type === "fatias") {
    return <span className="fatias-keyword">{word}</span>;
  }
  if (type === "persona") {
    return <span className="persona-keyword">{word}</span>;
  }
  if (type === "badge") {
    return <span className="badge-keyword">{word}</span>;
  }
  return <span>{word}</span>;
}

/* ── render a line with inline highlights ── */
function NarrativeLine({
  line,
}: {
  line: (typeof narrativeLines)[number];
}) {
  if (line.highlights.length === 0) {
    return <>{line.text}{line.suffix}</>;
  }

  // Build the full sentence, inserting highlights at the right positions
  let remaining = line.text;
  const parts: React.ReactNode[] = [];

  line.highlights.forEach((h, i) => {
    // For "corpo" and "gancho" on same line, join with " e "
    if (i > 0) parts.push(" e ");
    parts.push(remaining);
    remaining = "";
    parts.push(<KeywordSpan key={h.word} word={h.word} type={h.type} />);
  });

  parts.push(line.suffix);
  return <>{parts}</>;
}

/* ── Hook Card Component ── */
function HookCard({ id, roas, winner }: { id: number; roas: string; winner: boolean }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <motion.div
      onClick={() => setExpanded(!expanded)}
      whileHover={{ scale: 1.04, y: -4 }}
      className={`relative cursor-pointer rounded-2xl p-4 md:p-5 border transition-all duration-300 ${
        winner
          ? "border-green-500/50 bg-green-500/[0.07] shadow-[0_0_30px_-5px_rgba(34,197,94,0.2)]"
          : "border-secondary/20 bg-secondary/[0.04]"
      }`}
    >
      {winner && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 flex items-center gap-1.5 px-3 py-1 rounded-full bg-green-500/20 border border-green-500/40 text-[10px] font-bold text-green-400 uppercase tracking-wider">
          <Trophy className="w-3 h-3" />
          Pré-escala
        </div>
      )}
      <p className="text-xs font-bold text-secondary tracking-wider mb-1" style={{ fontFamily: "'Montserrat', sans-serif" }}>
        GANCHO {id}
      </p>
      <p className="text-[10px] text-muted-foreground mb-2">Persona diferente</p>
      <p
        className={`text-3xl md:text-4xl font-black ${
          winner ? "text-green-400" : "text-foreground/70"
        }`}
        style={{ fontFamily: "'Oswald', sans-serif" }}
      >
        {roas}
      </p>
      <p className="text-[10px] text-muted-foreground mt-1">ROAS</p>

      <motion.div
        initial={false}
        animate={{ height: expanded ? "auto" : 0, opacity: expanded ? 1 : 0 }}
        className="overflow-hidden"
      >
        <p className="text-xs text-muted-foreground mt-3 pt-3 border-t border-secondary/10">
          Mudou a persona que o criativo atingiu.
        </p>
      </motion.div>
    </motion.div>
  );
}

/* ── Proof Card ── */
function ProofCard({
  src,
  alt,
  caption,
  delay,
  isVisible,
}: {
  src: string;
  alt: string;
  caption: string;
  delay: number;
  isVisible: boolean;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      animate={isVisible ? { opacity: 1, y: 0 } : {}}
      transition={{ delay: delay / 1000, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
      className="proof-image-card group"
    >
      <div className="relative overflow-hidden rounded-xl border border-secondary/20 shadow-lg shadow-secondary/5">
        <div className="absolute inset-0 bg-gradient-to-br from-secondary/10 via-transparent to-primary/10 opacity-0 group-hover:opacity-100 transition-opacity duration-500 z-10 pointer-events-none" />
        <img
          src={src}
          alt={alt}
          loading="lazy"
          className="w-full h-auto transition-transform duration-500 group-hover:scale-[1.03]"
        />
      </div>
      <p className="text-xs md:text-sm text-muted-foreground mt-3 text-center leading-relaxed">
        {caption.split(/\b(GANCHO|ROAS|Meta)\b/).map((part, i) =>
          ["GANCHO", "ROAS", "Meta"].includes(part) ? (
            <span key={i} className="text-secondary font-semibold">{part}</span>
          ) : (
            part
          )
        )}
      </p>
    </motion.div>
  );
}

/* ── Main Section ── */
export function GanchoCorpoSection() {
  const { ref, isVisible } = useReveal(0.05);
  const navigate = useNavigate();
  const { trackStartClick } = useTracking();

  const handleCTA = async () => {
    try { await trackStartClick("gancho_corpo_cta"); } catch {}
    await new Promise((r) => setTimeout(r, 50));
    navigate("/quiz");
  };

  return (
    <section ref={ref} className="relative py-16 md:py-24 overflow-hidden">
      {/* Subtle cross-pattern background */}
      <div className="absolute inset-0 opacity-[0.03]" style={{
        backgroundImage: `url("data:image/svg+xml,%3Csvg width='40' height='40' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M20 0v40M0 20h40' stroke='%23f4bb39' stroke-width='0.5' fill='none'/%3E%3C/svg%3E")`,
        backgroundSize: "40px 40px",
      }} />

      <div className="container mx-auto px-5 max-w-5xl relative z-10">
        {/* ── Header ── */}
        <div className={`text-center mb-12 md:mb-16 reveal-up ${isVisible ? "visible" : ""}`}>
          <motion.p
            initial={{ opacity: 0, y: 10 }}
            animate={isVisible ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.4 }}
            className="text-xs md:text-sm font-bold tracking-[0.25em] text-secondary/80 mb-4"
            style={{ fontFamily: "'Montserrat', sans-serif" }}
          >
            NOSSO DIFERENCIAL
          </motion.p>

          <h2 className="text-foreground mb-4">
            <ShimmerText isVisible={isVisible}>
              Mesmo corpo, 4 ganchos diferentes...
            </ShimmerText>
            <br />
            <ShimmerText isVisible={isVisible} delay={200}>
              <KeywordGlow>4 resultados totalmente diferentes.</KeywordGlow>
            </ShimmerText>
          </h2>

          <LineReveal isVisible={isVisible} delay={500} className="max-w-2xl mx-auto">
            <p className="text-sm md:text-base text-muted-foreground leading-relaxed">
              Como 1 <span className="text-secondary font-semibold">SIMPLES GANCHO</span> de míseros{" "}
              <span className="text-secondary font-semibold">3 SEGUNDOS</span> podem fazer tanta diferença?
            </p>
          </LineReveal>
        </div>

        {/* ── 2-col: Narrative + Proofs ── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 md:gap-14 mb-12 md:mb-16">
          {/* Left: Narrative */}
          <div className="space-y-3 md:space-y-4">
            {narrativeLines.map((line, i) => (
              <LineReveal key={i} isVisible={isVisible} delay={600 + i * 120}>
                <p className="text-sm md:text-[15px] text-foreground/80 leading-relaxed">
                  <NarrativeLine line={line} />
                </p>
              </LineReveal>
            ))}
          </div>

          {/* Right: Proof images */}
          <div className="space-y-6">
            <ProofCard
              src="/proofs/depoimento-ganchos.png?v=2"
              alt="Print mostrando ROAS diferente apenas mudando o gancho do criativo"
              caption="Mesma estrutura. Só muda o GANCHO. Olha a diferença de ROAS."
              delay={800}
              isVisible={isVisible}
            />
            <ProofCard
              src="/proofs/feedback-matheus.png?v=2"
              alt="Planilha com métricas de conjuntos, vendas, IC, CPI e CPA"
              caption="Formatos e ângulos diferentes = leitura diferente do Meta."
              delay={1100}
              isVisible={isVisible}
            />
          </div>
        </div>

        {/* ── Hook Cards Strip ── */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={isVisible ? { opacity: 1, y: 0 } : {}}
          transition={{ delay: 1.4, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          className="mb-12 md:mb-16"
        >
          <p className="text-center text-xs font-bold tracking-[0.2em] text-secondary/60 mb-5" style={{ fontFamily: "'Montserrat', sans-serif" }}>
            MESMO CORPO, 4 GANCHOS
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
            {hookCards.map((card, i) => (
              <motion.div
                key={card.id}
                initial={{ opacity: 0, y: 20 }}
                animate={isVisible ? { opacity: 1, y: 0 } : {}}
                transition={{ delay: 1.5 + i * 0.1, duration: 0.5 }}
              >
                <HookCard {...card} />
              </motion.div>
            ))}
          </div>
        </motion.div>

        {/* ── Closing CTA ── */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={isVisible ? { opacity: 1, y: 0 } : {}}
          transition={{ delay: 1.9, duration: 0.6 }}
          className="text-center"
        >
          <p className="text-base md:text-lg text-foreground/90 font-medium mb-6 leading-relaxed max-w-xl mx-auto">
            Não é sobre fazer mais criativos. É sobre falar com mais{" "}
            <span className="text-secondary font-bold">PERSONAS</span> — do jeito certo.
          </p>
          <Button
            size="lg"
            onClick={handleCTA}
            className="group h-12 md:h-14 px-6 md:px-10 text-sm md:text-base font-bold bg-primary hover:bg-primary/90 text-primary-foreground rounded-2xl shadow-xl shadow-primary/25 hover:shadow-2xl hover:shadow-primary/35 transition-all duration-200 active:scale-[0.98]"
          >
            QUERO APLICAR ISSO NA MINHA OPERAÇÃO
            <ArrowRight className="w-4 h-4 md:w-5 md:h-5 ml-2 group-hover:translate-x-1 transition-transform" />
          </Button>
        </motion.div>
      </div>
    </section>
  );
}
