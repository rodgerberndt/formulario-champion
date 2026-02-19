import { useRef, useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { useReveal } from "@/hooks/useReveal";
import { ShimmerText, KeywordGlow } from "./TextEffects";
import { useIsMobile } from "@/hooks/use-mobile";

const pillars = [
  { label: "Onboarding / Feedback" },
  { label: "Copy" },
  { label: "Avatar IA / Real" },
  { label: "Edição" },
  { label: "Teste" },
  { label: "Repete o Ciclo", highlight: true },
];

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
  const sectionRef = useRef<HTMLDivElement>(null);
  const mobileRef = useRef<HTMLDivElement>(null);
  const [activePillars, setActivePillars] = useState(0);
  const isMobile = useIsMobile();

  // Desktop scroll-driven pillar activation
  useEffect(() => {
    if (!isVisible) return;
    const handleScroll = () => {
      const el = sectionRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const progress = Math.max(0, Math.min(1, (window.innerHeight - rect.top) / (rect.height + window.innerHeight * 0.2)));
      setActivePillars(Math.min(6, Math.floor(progress * 8)));
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();
    return () => window.removeEventListener("scroll", handleScroll);
  }, [isVisible]);

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
    const STEP_DELAY = 220;
    const HOLD_DURATION = 1200;
    const CYCLE_PAUSE = 4500;

    const runCycle = async () => {
      if (cancelled) return;
      // Trophy pulse
      setTrophyPulse(true);
      await sleep(300);
      if (cancelled) return;

      // Light each step
      for (let i = 0; i <= 5; i++) {
        if (cancelled) return;
        setLitIndex(i);
        await sleep(STEP_DELAY);
      }

      // Hold all lit
      setLitIndex(6);
      await sleep(HOLD_DURATION);
      if (cancelled) return;

      // Fade out
      setTrophyPulse(false);
      setLitIndex(-1);
      await sleep(CYCLE_PAUSE);
      if (cancelled) return;

      runCycle();
    };

    runCycle();
    return () => { cancelled = true; };
  }, [isMobile, mobileVisible]);

  const scrollToCTA = () => {
    document.querySelector("#cta-final")?.scrollIntoView({ behavior: "smooth" });
  };

  const desktopRadius = 190;
  const svgSize = (desktopRadius + 80) * 2;
  const svgCenter = svgSize / 2;
  const arrowRadius = desktopRadius - 30;

  return (
    <section id="metodo" className="py-16 md:py-28 relative" ref={ref}>
      <div ref={sectionRef} className="container mx-auto px-5 max-w-5xl">
        <div className={`text-center mb-12 reveal-up ${isVisible ? "visible" : ""}`}>
          <h2 className="text-foreground mb-3 max-w-3xl mx-auto">
            <ShimmerText isVisible={isVisible}>
              EXISTE UM MÉTODO COMPROVADO PARA FAZER SUA OFERTA ESCALAR INFINITAMENTE COM{" "}
            </ShimmerText>
            <KeywordGlow>OXIGENAÇÃO DE CRIATIVOS.</KeywordGlow>
          </h2>
        </div>

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
              <img src="/champion-logo.png" alt="Champion" width={80} height={80} loading="lazy" decoding="async" className={`relative z-10 w-20 h-20 object-contain transition-all duration-500 ${activePillars >= 6 ? "drop-shadow-[0_0_12px_hsl(42_90%_58%/0.4)]" : ""}`} />
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
                src="/champion-logo.png"
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

        <div className={`text-center mt-10 md:mt-16 transition-all duration-500 ${activePillars >= 6 ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}>
          <button onClick={scrollToCTA} className="text-secondary hover:text-secondary/80 text-sm font-semibold underline underline-offset-4 transition-colors min-h-[44px]">
            Quero o diagnóstico →
          </button>
        </div>
      </div>
    </section>
  );
}
