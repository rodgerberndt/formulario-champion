import { useRef, useState, useEffect } from "react";
import { motion } from "framer-motion";
import { useReveal } from "@/hooks/useReveal";
import { ChevronRight } from "lucide-react";

const pillars = [
  { label: "Onboarding / Feedback" },
  { label: "Copy" },
  { label: "Avatar IA / Real" },
  { label: "Edição" },
  { label: "Teste" },
];

export function MetodoChampion() {
  const { ref, isVisible } = useReveal(0.1);
  const sectionRef = useRef<HTMLDivElement>(null);
  const [activePillars, setActivePillars] = useState(0);

  useEffect(() => {
    if (!isVisible) return;

    const handleScroll = () => {
      const el = sectionRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const progress = Math.max(0, Math.min(1, (window.innerHeight - rect.top) / (rect.height + window.innerHeight * 0.2)));
      setActivePillars(Math.min(5, Math.floor(progress * 7)));
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();
    return () => window.removeEventListener("scroll", handleScroll);
  }, [isVisible]);

  const scrollToCTA = () => {
    document.querySelector("#cta-final")?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <section id="metodo" className="py-16 md:py-28 relative" ref={ref}>
      <div ref={sectionRef} className="container mx-auto px-5 max-w-5xl">
        <div className={`text-center mb-12 reveal-up ${isVisible ? "visible" : ""}`}>
          <h2 className="text-foreground mb-3 max-w-3xl mx-auto">
            EXISTE UM MÉTODO COMPROVADO PRA FAZER SEU CRIATIVO{" "}
            <span className="gold-text">NÃO PARAR DE VENDER</span>
          </h2>
        </div>

        {/* Emblem + Pillars */}
        <div className={`reveal-up ${isVisible ? "visible" : ""}`} style={{ transitionDelay: "200ms" }}>

          {/* Desktop: circular layout */}
          <div className="hidden md:flex items-center justify-center relative" style={{ minHeight: 420 }}>
            {/* Center emblem */}
            <div className="relative w-56 h-56 flex items-center justify-center z-10">
              <div
                className={`absolute inset-0 rounded-full transition-all duration-700 ${
                  activePillars >= 5 ? "opacity-100" : "opacity-30"
                }`}
                style={{
                  background: "radial-gradient(circle, hsl(42 90% 58% / 0.15) 0%, transparent 70%)",
                  filter: "blur(25px)",
                }}
              />
              <div
                className={`absolute inset-4 rounded-full transition-all duration-500 ${
                  activePillars >= 5
                    ? "border-2 border-secondary/60 shadow-[0_0_30px_-5px_hsl(42_90%_58%/0.3)]"
                    : "border border-border/30"
                }`}
                style={{
                  background: "linear-gradient(135deg, hsl(235 60% 7%), hsl(235 60% 5%))",
                }}
              />
              <img
                src="/champion-logo.png"
                alt="Champion"
                className={`relative z-10 w-20 h-20 object-contain transition-all duration-500 ${
                  activePillars >= 5 ? "drop-shadow-[0_0_12px_hsl(42_90%_58%/0.4)]" : ""
                }`}
              />
              <span className="absolute bottom-7 z-10 text-[10px] font-bold uppercase tracking-wider text-secondary/80">
                Esteira semanal
              </span>
            </div>

            {/* Desktop pillars in a circle */}
            {pillars.map((pillar, i) => {
              const angle = (i * 360) / pillars.length - 90;
              const rad = angle * (Math.PI / 180);
              const radius = 190;
              const x = Math.cos(rad) * radius;
              const y = Math.sin(rad) * radius;
              const isActive = i < activePillars;
              const nextAngle = ((i + 1) % pillars.length * 360) / pillars.length - 90;
              const arrowRad = ((angle + nextAngle) / 2 + (i === pillars.length - 1 ? 180 : 0)) * (Math.PI / 180);

              return (
                <motion.div
                  key={pillar.label}
                  className="absolute"
                  style={{
                    left: `calc(50% + ${x}px - 65px)`,
                    top: `calc(50% + ${y}px - 18px)`,
                    width: 130,
                  }}
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={isVisible ? { opacity: 1, scale: 1 } : {}}
                  transition={{ delay: 0.3 + i * 0.08, duration: 0.4 }}
                >
                  <div
                    className={`text-center px-3 py-2.5 rounded-xl border transition-all duration-500 ${
                      isActive
                        ? "border-secondary/40 bg-[hsl(42_90%_58%/0.08)] shadow-[0_0_15px_-5px_hsl(42_90%_58%/0.2)]"
                        : "border-border/20 bg-muted/10"
                    }`}
                  >
                    <span
                      className={`text-[11px] font-bold uppercase tracking-wider transition-colors duration-500 ${
                        isActive ? "text-secondary" : "text-muted-foreground/50"
                      }`}
                    >
                      {pillar.label}
                    </span>
                  </div>
                </motion.div>
              );
            })}

            {/* Arrow indicators between pillars (desktop) */}
            {pillars.map((_, i) => {
              const angle1 = (i * 360) / pillars.length - 90;
              const angle2 = (((i + 1) % pillars.length) * 360) / pillars.length - 90;
              const midAngle = i === pillars.length - 1
                ? (angle1 + (angle2 + 360)) / 2
                : (angle1 + angle2) / 2;
              const rad = midAngle * (Math.PI / 180);
              const arrowRadius = 155;
              const ax = Math.cos(rad) * arrowRadius;
              const ay = Math.sin(rad) * arrowRadius;
              const isActive = i < activePillars;

              return (
                <motion.div
                  key={`arrow-${i}`}
                  className="absolute"
                  style={{
                    left: `calc(50% + ${ax}px - 8px)`,
                    top: `calc(50% + ${ay}px - 8px)`,
                    transform: `rotate(${midAngle + 90}deg)`,
                  }}
                  initial={{ opacity: 0 }}
                  animate={isVisible ? { opacity: isActive ? 0.8 : 0.2 } : { opacity: 0 }}
                  transition={{ delay: 0.5 + i * 0.08, duration: 0.4 }}
                >
                  <ChevronRight className={`w-4 h-4 transition-colors duration-500 ${isActive ? "text-secondary" : "text-muted-foreground/30"}`} />
                </motion.div>
              );
            })}
          </div>

          {/* Mobile: vertical flow with arrows */}
          <div className="md:hidden flex flex-col items-center gap-1">
            {/* Emblem */}
            <div className="relative w-40 h-40 flex items-center justify-center mb-4">
              <div
                className={`absolute inset-3 rounded-full transition-all duration-500 ${
                  activePillars >= 5
                    ? "border-2 border-secondary/60 shadow-[0_0_20px_-5px_hsl(42_90%_58%/0.3)]"
                    : "border border-border/30"
                }`}
                style={{
                  background: "linear-gradient(135deg, hsl(235 60% 7%), hsl(235 60% 5%))",
                }}
              />
              <img
                src="/champion-logo.png"
                alt="Champion"
                className={`relative z-10 w-14 h-14 object-contain transition-all duration-500 ${
                  activePillars >= 5 ? "drop-shadow-[0_0_10px_hsl(42_90%_58%/0.4)]" : ""
                }`}
              />
              <span className="absolute bottom-5 z-10 text-[9px] font-bold uppercase tracking-wider text-secondary/80">
                Esteira semanal
              </span>
            </div>

            {/* Pillars as flow */}
            {pillars.map((pillar, i) => {
              const isActive = i < activePillars;
              return (
                <div key={pillar.label} className="flex flex-col items-center">
                  <div
                    className={`text-center px-5 py-2.5 rounded-xl border transition-all duration-400 ${
                      isActive
                        ? "border-secondary/40 bg-[hsl(42_90%_58%/0.08)]"
                        : "border-border/20 bg-muted/10"
                    }`}
                  >
                    <span className={`text-[11px] font-bold uppercase tracking-wider ${isActive ? "text-secondary" : "text-muted-foreground/50"}`}>
                      {pillar.label}
                    </span>
                  </div>
                  {/* Arrow between items */}
                  {i < pillars.length - 1 && (
                    <ChevronRight
                      className={`w-4 h-4 rotate-90 my-1 transition-colors duration-500 ${
                        isActive ? "text-secondary/60" : "text-muted-foreground/20"
                      }`}
                    />
                  )}
                  {/* Loop arrow after last */}
                  {i === pillars.length - 1 && (
                    <div className="flex items-center gap-1 mt-1 text-secondary/60">
                      <span className="text-[10px] font-semibold uppercase tracking-wider">↻ volta ao início</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* CTA */}
        <div className={`text-center mt-10 md:mt-16 transition-all duration-500 ${activePillars >= 5 ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}>
          <button
            onClick={scrollToCTA}
            className="text-secondary hover:text-secondary/80 text-sm font-semibold underline underline-offset-4 transition-colors min-h-[44px]"
          >
            Quero o diagnóstico →
          </button>
        </div>
      </div>
    </section>
  );
}
