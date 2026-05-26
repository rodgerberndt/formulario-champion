import { useRef, useState, useEffect } from "react";
import { motion } from "framer-motion";
import { useReveal } from "@/hooks/useReveal";
import { ShimmerText, KeywordGlow } from "./TextEffects";
import { useIsMobile } from "@/hooks/use-mobile";
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

const pillars = [
  { label: "Onboarding / Feedback" },
  { label: "Copy" },
  { label: "Avatar IA / Real" },
  { label: "Edição" },
  { label: "Teste" },
  { label: "Repete o Ciclo", highlight: true },
];

/* ────────────────────────────────────────────────────────── */
/*  4-Pilares overview data                                   */
/* ────────────────────────────────────────────────────────── */
const fourPillars = [
  { n: "01", title: "Plano de Ação Personalizado", icon: ClipboardList },
  { n: "02", title: "Estratégia &nbsp;ANDRÔMEDA", icon: Brain },
  { n: "03", title: "Volume: Esteira Semanal", icon: Layers },
  { n: "04", title: "Comunicação", icon: MessagesSquare },
];

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

export function MetodoChampion() {
  const { ref, isVisible } = useReveal(0.1);
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
              Método Champion · 4 Pilares
            </span>
          </div>
          <h2 className="text-foreground mb-3 max-w-3xl mx-auto">
            <ShimmerText isVisible={isVisible}>
              Como traduzimos o{" "}
            </ShimmerText>
            <KeywordGlow>&nbsp;ANDROMEDA</KeywordGlow>
            <ShimmerText isVisible={isVisible}> em resultado.</ShimmerText>
          </h2>
          <p className="text-sm md:text-base text-muted-foreground max-w-2xl mx-auto">
            O novo motor de IA do Meta exige <span className="text-foreground font-semibold">mais formatos, ângulos e personas</span>. Nossa operação foi desenhada para alimentar exatamente isso.
          </p>
        </div>

        {/* Overview layout: Andromeda → 4 pillars → ROI */}
        <div className={`grid grid-cols-1 lg:grid-cols-[1fr_2fr_1fr] gap-4 md:gap-6 items-stretch mb-20 md:mb-28 reveal-up ${isVisible ? "visible" : ""}`} style={{ transitionDelay: "150ms" }}>
          {/* Input: Meta IA Andromeda */}
          <div className="rounded-2xl p-6 md:p-7 border border-primary/40 bg-gradient-to-br from-primary/15 via-primary/5 to-transparent text-center flex flex-col items-center justify-center min-h-[220px]">
            <Sparkles className="w-8 h-8 text-secondary mb-3" />
            <p className="text-[10px] font-bold tracking-[0.2em] text-secondary/80 mb-1">META IA</p>
            <p className="text-2xl font-bold text-foreground mb-2" style={{ fontFamily: "'Oswald', sans-serif" }}>&nbsp;ANDROMEDA</p>
            <p className="text-xs text-muted-foreground">pede variedade em escala</p>
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
                  <p className="text-sm md:text-base font-bold text-foreground">{p.title}</p>
                </div>
              </motion.a>
            ))}
          </div>

          {/* Output: ROI */}
          <div className="rounded-2xl p-6 md:p-7 border border-secondary/40 bg-gradient-to-br from-secondary/15 via-secondary/5 to-transparent text-center flex flex-col items-center justify-center min-h-[220px]">
            <p className="text-[10px] font-bold tracking-[0.2em] text-secondary/80 mb-2">OUTPUT</p>
            <p className="text-4xl font-black text-secondary mb-2" style={{ fontFamily: "'Oswald', sans-serif" }}>ROI</p>
            <p className="text-xs text-muted-foreground">escala previsível e<br />CPA controlado</p>
          </div>
        </div>

        {/* ───────── PILAR 01 · PLANO DE AÇÃO PERSONALIZADO ───────── */}
        <PillarBlock n="01" title="Plano de Ação Personalizado" icon={ClipboardList} subtitle="O mapa completo da sua operação antes de qualquer criativo sair">
          <div className="grid md:grid-cols-2 gap-5">
            <div className="gold-card">
              <Target className="w-5 h-5 text-secondary mb-2" />
              <h4 className="text-base font-bold text-foreground mb-1.5">Mapa da oferta, produto e operação</h4>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Metas de faturamento, faturamento atual, personas, dores, desejos, para quem você vende e <span className="text-foreground font-semibold">como</span> vende. Sem isso, criativo é tiro no escuro.
              </p>
            </div>
            <div className="gold-card">
              <Film className="w-5 h-5 text-secondary mb-2" />
              <h4 className="text-base font-bold text-foreground mb-1.5">Briefing cirúrgico de criativos</h4>
              <p className="text-sm text-muted-foreground leading-relaxed mb-3">
                Classificamos cada criativo seu em 4 categorias antes de produzir um único frame novo:
              </p>
              <ul className="space-y-1.5 text-xs text-foreground/80">
                <li className="flex gap-2"><CheckCircle2 className="w-3.5 h-3.5 text-green-500 mt-0.5 shrink-0" /> Validados que estão escalando</li>
                <li className="flex gap-2"><CheckCircle2 className="w-3.5 h-3.5 text-secondary mt-0.5 shrink-0" /> Saturados (precisam ser substituídos)</li>
                <li className="flex gap-2"><CheckCircle2 className="w-3.5 h-3.5 text-secondary mt-0.5 shrink-0" /> Venderam, mas não escalaram</li>
                <li className="flex gap-2"><CheckCircle2 className="w-3.5 h-3.5 text-destructive/80 mt-0.5 shrink-0" /> Não performaram (e por quê)</li>
              </ul>
            </div>
          </div>
        </PillarBlock>

        {/* ───────── PILAR 02 · ESTRATÉGIA &nbsp;ANDROMEDA ───────── */}
        <PillarBlock n="02" title="Estratégia &nbsp;ANDROMEDA" icon={Brain} subtitle="Mesmo corpo, múltiplas entradas: é isso que faz a Meta IA escalar.">
          <div className="grid md:grid-cols-3 gap-4 mb-8">
            {[
              { icon: Users, title: "Personas", desc: "Cada criativo é construído para uma fatia de público diferente. Mais personas = mais portas de entrada." },
              { icon: Film, title: "Formatos", desc: "A mesma mensagem embalada de várias formas: UGC, VSL curta, depoimento, demonstração, captura." },
              { icon: Target, title: "Ângulos", desc: "Formas diferentes de contar a mesma história para impactar públicos distintos no mesmo público." },
            ].map((b) => (
              <div key={b.title} className="gold-card">
                <b.icon className="w-5 h-5 text-secondary mb-2" />
                <h4 className="text-base font-bold text-foreground mb-1.5">{b.title}</h4>
                <p className="text-sm text-muted-foreground leading-relaxed">{b.desc}</p>
              </div>
            ))}
          </div>

          <p className="text-center text-xs font-bold tracking-[0.2em] text-secondary/70 mb-4">
            MESMO CORPO · 4 GANCHOS · 4 RESULTADOS
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 pt-4">
            {hookCards.map((c) => (
              <HookCard key={c.id} {...c} />
            ))}
          </div>
          <p className="text-center text-sm md:text-base text-foreground/85 mt-6 max-w-2xl mx-auto">
            Não é sobre fazer <span className="line-through opacity-60">mais</span> criativos. É sobre falar com mais <KeywordGlow>personas</KeywordGlow>, do jeito certo.
          </p>
        </PillarBlock>

        {/* ───────── PILAR 03 · VOLUME · ESTEIRA SEMANAL ───────── */}
        <PillarBlock n="03" title="Volume: Esteira Semanal" icon={Layers} subtitle="Um ciclo completo, toda semana. É assim que a oxigenação acontece.">
        <div className={`reveal-up ${isVisible ? "visible" : ""}`} style={{ transitionDelay: "200ms" }}>

          {/* Desktop */}
          <div className="hidden md:flex items-center justify-center relative" style={{ minHeight: 420 }}>
            {/* SVG arrows layer */}
            <svg
              width={svgSize}
              height={svgSize}
              className="absolute pointer-events-none"
              style={{ left: `calc(50% - ${svgCenter}px)`, top: `calc(50% - ${svgCenter}px)` }}
              viewBox={`${-svgCenter} ${-svgCenter} ${svgSize} ${svgSize}`}
            >
              {pillars.map((_, i) => {
                const a1 = (i * 360) / pillars.length - 90 + 25;
                const a2 = (((i + 1) % pillars.length) * 360) / pillars.length - 90 - 25;
                const a2Adj = a2 < a1 ? a2 + 360 : a2;
                return (
                  <CurvedArrow
                    key={`arrow-${i}`}
                    angle1={a1}
                    angle2={a2 < a1 ? a2 + 360 : a2}
                    radius={arrowRadius}
                    isActive={i < activePillars}
                  />
                );
              })}
            </svg>

            {/* Center emblem */}
            <div className="relative w-56 h-56 flex items-center justify-center z-10">
              <div
                className={`absolute inset-0 rounded-full transition-all duration-700 ${activePillars >= 6 ? "opacity-100" : "opacity-30"}`}
                style={{ background: "radial-gradient(circle, hsl(42 90% 58% / 0.15) 0%, transparent 70%)", filter: "blur(25px)" }}
              />
              <div
                className={`absolute inset-4 rounded-full transition-all duration-500 ${
                  activePillars >= 6 ? "border-2 border-secondary/60 shadow-[0_0_30px_-5px_hsl(42_90%_58%/0.3)]" : "border border-border/30"
                }`}
                style={{ background: "linear-gradient(135deg, hsl(235 60% 7%), hsl(235 60% 5%))" }}
              />
              <img src="/champion-logo.webp" alt="Champion" width={80} height={80} loading="lazy" decoding="async" className={`relative z-10 w-20 h-20 object-contain transition-all duration-500 ${activePillars >= 6 ? "drop-shadow-[0_0_12px_hsl(42_90%_58%/0.4)]" : ""}`} />
              <span className="absolute bottom-7 z-10 text-[10px] font-bold uppercase tracking-wider text-secondary/80">Esteira semanal</span>
            </div>

            {/* Pillars */}
            {pillars.map((pillar, i) => {
              const angle = (i * 360) / pillars.length - 90;
              const rad = (angle * Math.PI) / 180;
              const x = Math.cos(rad) * desktopRadius;
              const y = Math.sin(rad) * desktopRadius;
              const isActive = i < activePillars;
              const isHighlight = (pillar as any).highlight;
              return (
                <motion.div
                  key={pillar.label}
                  className="absolute z-20"
                  style={{ left: `calc(50% + ${x}px - 65px)`, top: `calc(50% + ${y}px - 18px)`, width: 130 }}
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={isVisible ? { opacity: 1, scale: isHighlight && isActive ? [1, 1.08, 1] : 1 } : {}}
                  transition={isHighlight && isActive
                    ? { delay: 0.3 + i * 0.08, duration: 0.6, scale: { repeat: 1, duration: 0.5 } }
                    : { delay: 0.3 + i * 0.08, duration: 0.4 }
                  }
                >
                  <div className={`text-center px-3 py-2.5 rounded-xl border transition-all duration-500 ${
                    isHighlight && isActive
                      ? "border-secondary/70 bg-[hsl(42_90%_58%/0.15)] shadow-[0_0_20px_-3px_hsl(42_90%_58%/0.35)]"
                      : isActive
                        ? "border-secondary/40 bg-[hsl(42_90%_58%/0.08)] shadow-[0_0_15px_-5px_hsl(42_90%_58%/0.2)]"
                        : "border-border/20 bg-muted/10"
                  }`}>
                    <span className={`text-[11px] font-bold uppercase tracking-wider transition-colors duration-500 ${
                      isHighlight && isActive ? "text-secondary drop-shadow-[0_0_6px_hsl(42_90%_58%/0.5)]" : isActive ? "text-secondary" : "text-muted-foreground/50"
                    }`}>
                      {isHighlight ? "↻ " : ""}{pillar.label}
                    </span>
                  </div>
                </motion.div>
              );
            })}
          </div>

          {/* Mobile */}
          <div ref={mobileRef} className="md:hidden flex flex-col items-center gap-0">
            {/* Trophy — bigger, no ring, strong glow */}
            <motion.div
              className="relative flex items-center justify-center mb-8 py-4"
              initial={{ opacity: 0, scale: 0.85 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true, amount: 0.5 }}
              transition={{ duration: 0.8, ease: "easeOut" }}
            >
              {/* Radial glow behind trophy */}
              <div
                className={`absolute w-48 h-48 rounded-full transition-all duration-700 ${
                  trophyPulse ? "opacity-100 scale-110" : "opacity-30 scale-100"
                }`}
                style={{
                  background: "radial-gradient(circle, hsl(42 90% 58% / 0.25) 0%, hsl(42 90% 58% / 0.08) 40%, transparent 70%)",
                  filter: "blur(20px)",
                }}
              />
              <img
                src="/champion-logo.webp"
                alt="Champion"
                width={100}
                height={100}
                loading="lazy"
                decoding="async"
                className={`relative z-10 w-24 h-24 max-w-[30vw] object-contain transition-all duration-700 ${
                  trophyPulse
                    ? "drop-shadow-[0_0_25px_hsl(42_90%_58%/0.6)] trophy-shine"
                    : "drop-shadow-[0_0_8px_hsl(42_90%_58%/0.2)]"
                }`}
              />
              <span className="absolute -bottom-1 z-10 text-[10px] font-bold uppercase tracking-wider text-secondary/80">
                Esteira semanal
              </span>
            </motion.div>

            {pillars.map((pillar, i) => {
              const isHighlight = (pillar as any).highlight;
              const isLit = litIndex >= i || litIndex === 6;
              return (
                <div key={pillar.label} className="flex flex-col items-center">
                  <div
                    className={`text-center px-5 py-2.5 rounded-xl border transition-all duration-500 ${
                      isLit
                        ? isHighlight
                          ? "border-secondary/70 bg-[hsl(42_90%_58%/0.15)] shadow-[0_0_20px_-3px_hsl(42_90%_58%/0.35)]"
                          : "border-secondary/50 bg-[hsl(42_90%_58%/0.08)] shadow-[0_0_12px_-3px_hsl(42_90%_58%/0.2)]"
                        : "border-border/20 bg-muted/10"
                    }`}
                  >
                    <span
                      className={`text-[11px] font-bold uppercase tracking-wider transition-all duration-500 ${
                        isLit
                          ? "text-secondary drop-shadow-[0_0_6px_hsl(42_90%_58%/0.4)]"
                          : "text-muted-foreground/50"
                      }`}
                    >
                      {isHighlight ? "↻ " : ""}
                      {pillar.label}
                    </span>
                  </div>
                  {/* Arrow down */}
                  {!isHighlight && (
                    <svg width="16" height="28" viewBox="0 0 16 28" className="my-2" fill="none">
                      <path
                        d="M8 0 L8 20"
                        stroke={isLit ? "hsl(42 90% 58%)" : "hsl(0 0% 40% / 0.25)"}
                        strokeWidth="1.5"
                        className="transition-all duration-500"
                      />
                      <polygon
                        points="8,27 4,20 12,20"
                        fill={isLit ? "hsl(42 90% 58%)" : "hsl(0 0% 40% / 0.25)"}
                        className="transition-all duration-500"
                      />
                    </svg>
                  )}
                </div>
              );
            })}
          </div>
        </div>

          {/* Esteira stacked infographic */}
          <div className="mt-10 md:mt-14 rounded-2xl overflow-hidden border border-secondary/20 bg-primary/[0.04]">
            <img
              src="/esteira-semanal.png"
              alt="Empilhamento da esteira semanal — 4 esteiras por mês com calls de checkpoint"
              loading="lazy"
              decoding="async"
              className="w-full h-auto block"
            />
          </div>
        </PillarBlock>

        {/* ───────── PILAR 04 · COMUNICAÇÃO ───────── */}
        <PillarBlock n="04" title="Comunicação" icon={MessagesSquare} subtitle="Você nunca fica no escuro. A operação inteira é transparente." last>
          <div className="grid md:grid-cols-2 gap-5">
            <div className="gold-card">
              <PhoneCall className="w-5 h-5 text-secondary mb-2" />
              <h4 className="text-base font-bold text-foreground mb-1.5">Calls de checkpoint a cada 2 semanas</h4>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Onboarding na 1ª semana e checkpoint nas semanas 3, 5 e 7. Cada ciclo: mais aprendizado, mais refinamento, mais assertividade.
              </p>
            </div>
            <div className="gold-card">
              <MessagesSquare className="w-5 h-5 text-secondary mb-2" />
              <h4 className="text-base font-bold text-foreground mb-1.5">Acompanhamento direto na operação</h4>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Canal direto com a equipe responsável. Você sabe o que está acontecendo, o porquê, e o próximo passo — sempre.
              </p>
            </div>
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
