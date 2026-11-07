import { useRef, useState, useEffect } from "react";
import { motion } from "framer-motion";
import { useReveal } from "@/hooks/useReveal";
import { ShimmerText, KeywordGlow } from "./TextEffects";
import { useIsMobile } from "@/hooks/use-mobile";
import { useCopyNicho } from "@/config/nichoLanding";
import {
  Sparkles,
  ClipboardList,
  Brain,
  Layers,
  MessagesSquare,
  Trophy,
  Target,
  Film,
  Users,
  CheckCircle2,
  PhoneCall,
} from "lucide-react";

const esteiraSteps = [
  "Alinhamento Estratégico",
  "Copy",
  "CRIAÇÃO DA COPY",
  "Aprovação",
  "Edição",
  "Entrega",
  "Teste",
  "Feedback",
];

/* ────────────────────────────────────────────────────────── */
/*  4-Pilares overview data                                   */
/* ────────────────────────────────────────────────────────── */
/* Hook cards (Pilar 2 – Andromeda) */
const hookCards = [
  { id: 1, roas: "0.31", winner: false },
  { id: 2, roas: "3.30", winner: true },
  { id: 3, roas: "0", winner: false },
  { id: 4, roas: "0.49", winner: false },
];

function HookCard({ id, roas, winner }: { id: number; roas: string; winner: boolean }) {
  return (
    <div
      className={`relative rounded-2xl p-4 md:p-5 border transition-all duration-300 ${
        winner
          ? "border-green-500/50 bg-green-500/[0.07] shadow-[0_0_30px_-5px_rgba(34,197,94,0.2)]"
          : "border-secondary/20 bg-secondary/[0.04]"
      }`}
    >
      {winner && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 flex items-center gap-1.5 px-3 py-1 rounded-full bg-green-500/20 border border-green-500/40 text-[10px] font-bold text-green-400 uppercase tracking-wider whitespace-nowrap">
          <Trophy className="w-3 h-3" />
          Pré-escala
        </div>
      )}
      <p className="text-xs font-bold text-secondary tracking-wider mb-1" style={{ fontFamily: "'Montserrat', sans-serif" }}>
        GANCHO {id}
      </p>
      <p className="text-[10px] text-muted-foreground mb-2">Persona diferente</p>
      <p
        className={`text-3xl md:text-4xl font-black ${winner ? "text-green-400" : "text-foreground/70"}`}
        style={{ fontFamily: "'Oswald', sans-serif" }}
      >
        {roas}
      </p>
      <p className="text-[10px] text-muted-foreground mt-1">ROAS</p>
    </div>
  );
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Curved arrow SVG between two positions on the circle */
function CurvedArrow({ angle1, angle2, radius, isActive }: { angle1: number; angle2: number; radius: number; isActive: boolean }) {
  const r1 = (angle1 * Math.PI) / 180;
  const r2 = (angle2 * Math.PI) / 180;
  const midAngle = (angle1 + angle2) / 2;
  const rMid = (midAngle * Math.PI) / 180;

  const x1 = Math.cos(r1) * radius;
  const y1 = Math.sin(r1) * radius;
  const x2 = Math.cos(r2) * radius;
  const y2 = Math.sin(r2) * radius;

  // Control point pushed outward for curve
  const cpRadius = radius * 1.15;
  const cx = Math.cos(rMid) * cpRadius;
  const cy = Math.sin(rMid) * cpRadius;

  // Arrowhead at end
  const arrowSize = 6;
  const dx = x2 - cx;
  const dy = y2 - cy;
  const len = Math.sqrt(dx * dx + dy * dy);
  const ux = dx / len;
  const uy = dy / len;
  const perpX = -uy;
  const perpY = ux;

  const tip = { x: x2, y: y2 };
  const left = { x: x2 - ux * arrowSize + perpX * arrowSize * 0.5, y: y2 - uy * arrowSize + perpY * arrowSize * 0.5 };
  const right = { x: x2 - ux * arrowSize - perpX * arrowSize * 0.5, y: y2 - uy * arrowSize - perpY * arrowSize * 0.5 };

  return (
    <g>
      <path
        d={`M ${x1} ${y1} Q ${cx} ${cy} ${x2} ${y2}`}
        fill="none"
        stroke={isActive ? "hsl(42 90% 58%)" : "hsl(0 0% 40% / 0.2)"}
        strokeWidth={1.5}
        strokeDasharray={isActive ? "none" : "4 4"}
        className="transition-all duration-500"
        opacity={isActive ? 0.7 : 0.3}
      />
      <polygon
        points={`${tip.x},${tip.y} ${left.x},${left.y} ${right.x},${right.y}`}
        fill={isActive ? "hsl(42 90% 58%)" : "hsl(0 0% 40% / 0.2)"}
        opacity={isActive ? 0.7 : 0.3}
        className="transition-all duration-500"
      />
    </g>
  );
}

/** Ícone de cada pilar, na ordem. O texto vem do nicho; o ícone não muda. */
const ICONES_PILARES = [ClipboardList, Brain, Layers, MessagesSquare];

/**
 * Texto do nicho com trechos em negrito marcados por **assim**.
 *
 * O negrito é parte do argumento (é ele que diz onde está a virada da frase),
 * então mora no texto, junto com a frase, e não numa regra do componente que
 * quebraria assim que a frase mudasse de nicho.
 */
function Realce({ texto }: { texto: string }) {
  return (
    <>
      {texto.split("**").map((parte, i) =>
        i % 2 === 1 ? (
          <span key={i} className="text-foreground font-semibold">
            {parte}
          </span>
        ) : (
          parte
        ),
      )}
    </>
  );
}

export function MetodoChampion() {
  const { ref, isVisible } = useReveal(0.1);
  const { metodo } = useCopyNicho();
  const fourPillars = metodo.pilares.map((p, i) => ({ ...p, icon: ICONES_PILARES[i] }));
  const mobileRef = useRef<HTMLDivElement>(null);
  const [activePillars] = useState(6);
  const isMobile = useIsMobile();

  // Mobile cascade glow cycle
  const [litIndex, setLitIndex] = useState(-1); // -1 = all off, 0-5 = lighting step i, 6 = all lit hold
  const [trophyPulse, setTrophyPulse] = useState(false);
  const [mobileVisible, setMobileVisible] = useState(false);

  useEffect(() => {
    if (!isMobile) return;
    const el = mobileRef.current;
    if (!el) return;
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const observer = new IntersectionObserver(
      ([entry]) => setMobileVisible(entry.isIntersecting),
      { threshold: 0.4 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [isMobile]);

  useEffect(() => {
    if (!isMobile || !mobileVisible) {
      setLitIndex(-1);
      setTrophyPulse(false);
      return;
    }

    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReducedMotion) {
      setTrophyPulse(true);
      setLitIndex(6);
      return;
    }

    let cancelled = false;
    const STEP_DELAY = 440;

    const runCycle = async () => {
      if (cancelled) return;
      // Trophy pulse
      setTrophyPulse(true);
      await sleep(500);
      if (cancelled) return;

      // Light each step — stays lit permanently
      for (let i = 0; i <= 5; i++) {
        if (cancelled) return;
        setLitIndex(i);
        await sleep(STEP_DELAY);
      }

      // Keep everything lit forever
      setLitIndex(6);
    };

    runCycle();
    return () => { cancelled = true; };
  }, [isMobile, mobileVisible]);

  const desktopRadius = 190;
  const svgSize = (desktopRadius + 80) * 2;
  const svgCenter = svgSize / 2;
  const arrowRadius = desktopRadius - 30;

  return (
    <section id="metodo" className="py-16 md:py-28 relative" ref={ref}>
      <div className="container mx-auto px-5 max-w-6xl">
        {/* ───────── OVERVIEW · MÉTODO CHAMPION · 4 PILARES ───────── */}
        <div className={`text-center mb-10 reveal-up ${isVisible ? "visible" : ""}`}>
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-secondary/40 bg-secondary/[0.06] mb-5">
            <Sparkles className="w-3.5 h-3.5 text-secondary" />
            <span className="text-[11px] md:text-xs font-bold tracking-[0.2em] text-secondary uppercase">
              {metodo.selo}
            </span>
          </div>
          <h2 className="text-foreground mb-3 max-w-3xl mx-auto">
            <ShimmerText isVisible={isVisible}>{metodo.tituloInicio}</ShimmerText>
            <KeywordGlow>{metodo.tituloDestaque}</KeywordGlow>
            <ShimmerText isVisible={isVisible}>{metodo.tituloFim}</ShimmerText>
          </h2>
          <p className="text-sm md:text-base text-muted-foreground max-w-2xl mx-auto">
            <Realce texto={metodo.sub} />
          </p>
        </div>

        {/* Overview layout: Andromeda → 4 pillars → ROI */}
        <div className={`grid grid-cols-1 lg:grid-cols-[1fr_2fr_1fr] gap-4 md:gap-6 items-stretch mb-20 md:mb-28 reveal-up ${isVisible ? "visible" : ""}`} style={{ transitionDelay: "150ms" }}>
          {/* Input: Meta IA Andromeda */}
          <div className="rounded-2xl p-6 md:p-7 border border-primary/40 bg-gradient-to-br from-primary/15 via-primary/5 to-transparent text-center flex flex-col items-center justify-center min-h-[220px]">
            <Sparkles className="w-8 h-8 text-secondary mb-3" />
            <p className="text-[10px] font-bold tracking-[0.2em] text-secondary/80 mb-1">{metodo.entradaRotulo}</p>
            <p className="text-2xl font-bold text-foreground mb-2" style={{ fontFamily: "'Oswald', sans-serif" }}>{metodo.entradaNome}</p>
            <p className="text-xs text-muted-foreground">{metodo.entradaDesc}</p>
          </div>

          {/* 4 pillars list */}
          <div className="flex flex-col gap-3">
            {fourPillars.map((p, i) => (
              <motion.a
                href={`#pilar-${p.n}`}
                key={p.n}
                initial={{ opacity: 0, x: -10 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true, amount: 0.4 }}
                transition={{ delay: i * 0.08, duration: 0.4 }}
                className="flex items-center gap-4 rounded-xl px-4 py-3 border border-secondary/20 bg-secondary/[0.04] hover:border-secondary/50 hover:bg-secondary/[0.08] transition-all"
              >
                <div className="w-10 h-10 rounded-lg bg-secondary/15 border border-secondary/30 flex items-center justify-center shrink-0">
                  <p.icon className="w-5 h-5 text-secondary" />
                </div>
                <div className="text-left">
                  <p className="text-[10px] font-bold tracking-[0.2em] text-secondary/70">PILAR {p.n}</p>
                  <p className="text-sm md:text-base font-bold text-foreground">{p.titulo}</p>
                </div>
              </motion.a>
            ))}
          </div>

          {/* Output: ROI */}
          <div className="rounded-2xl p-6 md:p-7 border border-secondary/40 bg-gradient-to-br from-secondary/15 via-secondary/5 to-transparent text-center flex flex-col items-center justify-center min-h-[220px]">
            <p className="text-[10px] font-bold tracking-[0.2em] text-secondary/80 mb-2">{metodo.saidaRotulo}</p>
            <p className="text-4xl font-black text-secondary mb-2" style={{ fontFamily: "'Oswald', sans-serif" }}>{metodo.saidaNome}</p>
            <p className="text-xs text-muted-foreground whitespace-pre-line">{metodo.saidaDesc}</p>
          </div>
        </div>

        {/* ───────── PILAR 01 · PLANO DE AÇÃO PERSONALIZADO ───────── */}
        <PillarBlock n="01" title={metodo.pilares[0].titulo} icon={ClipboardList} subtitle={metodo.pilares[0].subtitulo}>
          <div className="grid md:grid-cols-2 gap-5">
            <div className="gold-card">
              <Target className="w-5 h-5 text-secondary mb-2" />
              <h4 className="text-base font-bold text-foreground mb-1.5">{metodo.pilar1.mapa.titulo}</h4>
              <p className="text-sm text-muted-foreground leading-relaxed">
                <Realce texto={metodo.pilar1.mapa.desc} />
              </p>
            </div>
            <div className="gold-card">
              <Film className="w-5 h-5 text-secondary mb-2" />
              <h4 className="text-base font-bold text-foreground mb-1.5">{metodo.pilar1.briefing.titulo}</h4>
              <p className="text-sm text-muted-foreground leading-relaxed mb-3">
                {metodo.pilar1.briefing.desc}
              </p>
              {/* A cor do check é a semântica da categoria (verde = escalando,
                  vermelho = não performou), por isso ela fica aqui e não no
                  texto do nicho. */}
              <ul className="space-y-1.5 text-xs text-foreground/80">
                {metodo.pilar1.categorias.map((cat, i) => (
                  <li key={cat} className="flex gap-2">
                    <CheckCircle2
                      className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${
                        i === 0 ? "text-green-500" : i === 3 ? "text-destructive/80" : "text-secondary"
                      }`}
                    />{" "}
                    {cat}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </PillarBlock>

        {/* ───────── PILAR 02 · ESTRATÉGIA ANDRÔMEDA ───────── */}
        <PillarBlock n="02" title={metodo.pilares[1].titulo} icon={Brain} subtitle={metodo.pilares[1].subtitulo}>
          <div className="grid md:grid-cols-3 gap-4 mb-8">
            {metodo.pilar2.blocos.map((b, i) => {
              const Icone = [Users, Film, Target][i];
              return (
                <div key={b.titulo} className="gold-card">
                  <Icone className="w-5 h-5 text-secondary mb-2" />
                  <h4 className="text-base font-bold text-foreground mb-1.5">{b.titulo}</h4>
                  <p className="text-sm text-muted-foreground leading-relaxed">{b.desc}</p>
                </div>
              );
            })}
          </div>

          <p className="text-center text-xs font-bold tracking-[0.2em] text-secondary/70 mb-4">
            {metodo.pilar2.rotuloGanchos}
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 pt-4">
            {hookCards.map((c) => (
              <HookCard key={c.id} {...c} />
            ))}
          </div>
          <p className="text-center text-sm md:text-base text-foreground/85 mt-6 max-w-2xl mx-auto">
            {metodo.pilar2.fechoInicio}<span className="line-through opacity-60">mais</span> criativos. É sobre falar com mais <KeywordGlow>{metodo.pilar2.fechoDestaque}</KeywordGlow>{metodo.pilar2.fechoFim}
          </p>
        </PillarBlock>

        {/* ───────── PILAR 03 · VOLUME · ESTEIRA SEMANAL ───────── */}
        <PillarBlock n="03" title={metodo.pilares[2].titulo} icon={Layers} subtitle={metodo.pilares[2].subtitulo}>
          <div className={`reveal-up ${isVisible ? "visible" : ""}`} style={{ transitionDelay: "200ms" }}>
            {/* Esteira label */}
            <div className="flex items-center justify-center gap-3 mb-4">
              <span className="h-px w-10 md:w-16 bg-secondary/40" />
              <span className="text-[10px] md:text-xs font-bold uppercase tracking-[0.3em] text-secondary/80">
                ↳ Esteira de produção semanal ↲
              </span>
              <span className="h-px w-10 md:w-16 bg-secondary/40" />
            </div>

            {/* Conveyor belt container */}
            <div className="relative rounded-2xl border border-secondary/30 bg-[hsl(42_90%_58%/0.04)] px-3 md:px-6 py-5 md:py-7 overflow-hidden shadow-[inset_0_0_30px_-10px_hsl(42_90%_58%/0.25)]">
              {/* Animated belt rails (top + bottom) */}
              <div
                className="pointer-events-none absolute left-0 right-0 top-0 h-2 opacity-60"
                style={{
                  backgroundImage:
                    "repeating-linear-gradient(90deg, hsl(42 90% 58% / 0.55) 0 12px, transparent 12px 24px)",
                  animation: "esteira-scroll 1.6s linear infinite",
                }}
              />
              <div
                className="pointer-events-none absolute left-0 right-0 bottom-0 h-2 opacity-60"
                style={{
                  backgroundImage:
                    "repeating-linear-gradient(90deg, hsl(42 90% 58% / 0.55) 0 12px, transparent 12px 24px)",
                  animation: "esteira-scroll 1.6s linear infinite",
                }}
              />

              {/* Steps flowing on the belt */}
              <div className="relative flex flex-wrap items-center justify-center gap-2 md:gap-3">
                {esteiraSteps.map((step, i) => (
                  <div key={step} className="flex items-center gap-2 md:gap-3">
                    <motion.div
                      initial={{ opacity: 0, x: -10 }}
                      whileInView={{ opacity: 1, x: 0 }}
                      viewport={{ once: true, amount: 0.4 }}
                      transition={{ delay: i * 0.06, duration: 0.4 }}
                      className="relative flex items-center gap-2 px-3 md:px-4 py-2 md:py-2.5 rounded-xl border border-secondary/40 bg-[hsl(42_90%_58%/0.10)] shadow-[0_0_15px_-5px_hsl(42_90%_58%/0.3)]"
                    >
                      <span className="text-[10px] md:text-xs font-black text-secondary/70" style={{ fontFamily: "'Oswald', sans-serif" }}>
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <span className="text-[11px] md:text-sm font-bold uppercase tracking-wider text-secondary">
                        {step}
                      </span>
                    </motion.div>
                    {i < esteiraSteps.length - 1 && (
                      <span className="text-secondary/50 text-base md:text-lg select-none">›››</span>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Loop back arrow */}
            <div className="flex justify-center mt-3">
              <span className="text-secondary/60 text-xl leading-none">⤴</span>
            </div>

            {/* Repete o ciclo — esteira nunca para */}
            <div className="flex justify-center mt-2">
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true, amount: 0.5 }}
                transition={{ delay: 0.5, duration: 0.5 }}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full border-2 border-secondary/60 bg-[hsl(42_90%_58%/0.15)] shadow-[0_0_25px_-5px_hsl(42_90%_58%/0.4)]"
              >
                <span className="text-secondary text-lg animate-spin" style={{ animationDuration: "4s" }}>↻</span>
                <span className="text-xs md:text-sm font-bold uppercase tracking-[0.2em] text-secondary drop-shadow-[0_0_6px_hsl(42_90%_58%/0.5)]">
                  Esteira em loop · toda semana
                </span>
              </motion.div>
            </div>

            {/* Stacking cycles → assertividade */}
            <div className="mt-10 md:mt-14 rounded-2xl border border-secondary/20 bg-primary/[0.04] p-5 md:p-8">
              <p className="text-center text-[10px] md:text-xs font-bold tracking-[0.25em] text-secondary/70 mb-5 md:mb-6">
                EMPILHANDO CICLOS · CADA SEMANA + ASSERTIVIDADE
              </p>
              <div className="flex items-end justify-center gap-3 md:gap-5 mb-4">
                {[1, 2, 3, 4].map((week, i) => {
                  const height = 50 + i * 28;
                  return (
                    <motion.div
                      key={week}
                      initial={{ opacity: 0, scaleY: 0.3 }}
                      whileInView={{ opacity: 1, scaleY: 1 }}
                      viewport={{ once: true, amount: 0.4 }}
                      transition={{ delay: i * 0.12, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                      style={{ height, transformOrigin: "bottom" }}
                      className="relative flex-1 max-w-[80px] rounded-t-lg border border-secondary/40 bg-gradient-to-t from-secondary/30 to-secondary/10 shadow-[0_0_20px_-5px_hsl(42_90%_58%/0.3)]"
                    >
                      <span className="absolute -top-6 left-1/2 -translate-x-1/2 text-[10px] md:text-xs font-bold text-secondary whitespace-nowrap">
                        Esteira {week}
                      </span>
                    </motion.div>
                  );
                })}
              </div>
              <p className="text-center text-sm md:text-base text-foreground/85 max-w-2xl mx-auto mt-6">
                {metodo.pilar3.fechoInicio}
                <KeywordGlow>{metodo.pilar3.fechoDestaque}</KeywordGlow>{metodo.pilar3.fechoFim}
              </p>
            </div>
          </div>
        </PillarBlock>

        {/* ───────── PILAR 04 · COMUNICAÇÃO ───────── */}
        <PillarBlock n="04" title={metodo.pilares[3].titulo} icon={MessagesSquare} subtitle={metodo.pilares[3].subtitulo} last>
          <div className="grid md:grid-cols-2 gap-5">
            {metodo.pilar4.cards.map((card, i) => {
              const Icone = [PhoneCall, MessagesSquare][i];
              return (
                <div key={card.titulo} className="gold-card">
                  <Icone className="w-5 h-5 text-secondary mb-2" />
                  <h4 className="text-base font-bold text-foreground mb-1.5">{card.titulo}</h4>
                  <p className="text-sm text-muted-foreground leading-relaxed">{card.desc}</p>
                </div>
              );
            })}
          </div>
        </PillarBlock>
      </div>
    </section>
  );
}

/* ────────────────────────────────────────────────────────── */
/*  PillarBlock — wrapper for each detailed pillar section    */
/* ────────────────────────────────────────────────────────── */
function PillarBlock({
  n,
  title,
  subtitle,
  icon: Icon,
  children,
  last,
}: {
  n: string;
  title: string;
  subtitle: string;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
  last?: boolean;
}) {
  return (
    <section id={`pilar-${n}`} className={`scroll-mt-24 ${last ? "mb-0" : "mb-20 md:mb-28"}`}>
      <div className="flex items-center gap-4 mb-6">
        <div className="w-12 h-12 rounded-xl bg-secondary/15 border border-secondary/40 flex items-center justify-center shrink-0">
          <Icon className="w-6 h-6 text-secondary" />
        </div>
        <div>
          <p className="text-[10px] md:text-xs font-bold tracking-[0.25em] text-secondary/80">PILAR {n}</p>
          <h3 className="text-xl md:text-2xl font-bold text-foreground leading-tight" style={{ fontFamily: "'Oswald', sans-serif" }}>
            {title}
          </h3>
        </div>
      </div>
      <p className="text-sm md:text-base text-muted-foreground mb-6 max-w-3xl">{subtitle}</p>
      {children}
    </section>
  );
}
