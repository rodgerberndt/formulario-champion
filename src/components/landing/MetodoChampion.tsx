import { useRef, useState, useEffect } from "react";
import { motion } from "framer-motion";
import { useReveal } from "@/hooks/useReveal";
import { RefreshCw } from "lucide-react";

const pillars = [
  { label: "Onboarding / Feedback", angle: 0 },
  { label: "Copy", angle: 60 },
  { label: "Avatar IA / Real", angle: 120 },
  { label: "Edição", angle: 180 },
  { label: "Teste", angle: 240 },
  { label: "REPETE O CICLO", angle: 300, highlight: true },
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
      setActivePillars(Math.min(6, Math.floor(progress * 8)));
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
        <div className={`relative flex items-center justify-center reveal-up ${isVisible ? "visible" : ""}`} style={{ transitionDelay: "200ms" }}>
          {/* Center emblem */}
          <div className="relative w-48 h-48 md:w-64 md:h-64 flex items-center justify-center">
            <div
              className={`absolute inset-0 rounded-full transition-all duration-700 ${
                activePillars >= 6 ? "opacity-100" : "opacity-30"
              }`}
              style={{
                background: "radial-gradient(circle, hsl(42 90% 58% / 0.15) 0%, transparent 70%)",
                filter: "blur(25px)",
              }}
            />
            <div
              className={`absolute inset-4 md:inset-5 rounded-full transition-all duration-500 ${
                activePillars >= 6
                  ? "border-2 border-secondary/60 shadow-[0_0_30px_-5px_hsl(42_90%_58%/0.3)]"
                  : "border border-border/30"
              }`}
              style={{
                background: "linear-gradient(135deg, hsl(235 60% 7%), hsl(235 60% 5%))",
              }}
            />
            {/* Logo */}
            <img
              src="/champion-logo.png"
              alt="Champion"
              className={`relative z-10 w-16 h-16 md:w-24 md:h-24 object-contain transition-all duration-500 ${
                activePillars >= 6 ? "drop-shadow-[0_0_12px_hsl(42_90%_58%/0.4)]" : ""
              }`}
            />
            {/* "Esteira semanal" label */}
            <span className="absolute bottom-6 md:bottom-8 z-10 text-[10px] md:text-xs font-bold uppercase tracking-wider text-secondary/80">
              Esteira semanal
            </span>
          </div>

          {/* Desktop pillars */}
          <div className="hidden md:block">
            {pillars.map((pillar, i) => {
              const rad = (pillar.angle - 90) * (Math.PI / 180);
              const radius = 185;
              const x = Math.cos(rad) * radius;
              const y = Math.sin(rad) * radius;
              const isActive = i < activePillars;

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
                    className={`text-center px-3 py-2 rounded-xl border transition-all duration-500 ${
                      isActive
                        ? pillar.highlight
                          ? "border-secondary/60 bg-secondary/15 shadow-[0_0_20px_-5px_hsl(42_90%_58%/0.3)]"
                          : "border-secondary/40 bg-[hsl(42_90%_58%/0.08)] shadow-[0_0_15px_-5px_hsl(42_90%_58%/0.2)]"
                        : "border-border/20 bg-muted/10"
                    }`}
                  >
                    {pillar.highlight && isActive && (
                      <RefreshCw className="w-3.5 h-3.5 text-secondary mx-auto mb-1" />
                    )}
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
          </div>

          {/* Mobile pillars - vertical list */}
          <div className="md:hidden absolute -bottom-52 left-0 right-0 px-4">
            <div className="grid grid-cols-2 gap-2">
              {pillars.map((pillar, i) => {
                const isActive = i < activePillars;
                return (
                  <div
                    key={pillar.label}
                    className={`text-center px-2 py-2.5 rounded-xl border transition-all duration-400 ${
                      isActive
                        ? pillar.highlight
                          ? "border-secondary/60 bg-secondary/15 col-span-2"
                          : "border-secondary/40 bg-[hsl(42_90%_58%/0.08)]"
                        : "border-border/20 bg-muted/10"
                    } ${pillar.highlight ? "col-span-2" : ""}`}
                  >
                    <div className="flex items-center justify-center gap-1.5">
                      {pillar.highlight && isActive && (
                        <RefreshCw className="w-3 h-3 text-secondary" />
                      )}
                      <span className={`text-[11px] font-bold uppercase ${isActive ? "text-secondary" : "text-muted-foreground/50"}`}>
                        {pillar.label}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* CTA */}
        <div className={`text-center mt-60 md:mt-16 transition-all duration-500 ${activePillars >= 6 ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}>
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
