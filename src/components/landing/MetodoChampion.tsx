import { useRef, useState, useEffect } from "react";
import { motion } from "framer-motion";
import { useReveal } from "@/hooks/useReveal";

const pillars = [
  { label: "Aquisição", angle: 0 },
  { label: "Hook", angle: 60 },
  { label: "Retenção", angle: 120 },
  { label: "Oferta", angle: 180 },
  { label: "Testes Semanais", angle: 240 },
  { label: "Escala", angle: 300 },
];

export function MetodoChampion() {
  const { ref, isVisible } = useReveal(0.15);
  const sectionRef = useRef<HTMLDivElement>(null);
  const [activePillars, setActivePillars] = useState(0);

  useEffect(() => {
    if (!isVisible) return;

    const handleScroll = () => {
      const el = sectionRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const progress = Math.max(0, Math.min(1, (window.innerHeight - rect.top) / (rect.height + window.innerHeight * 0.3)));
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
    <section id="metodo" className="py-20 md:py-32 relative" ref={ref}>
      <div ref={sectionRef} className="container mx-auto px-5 max-w-5xl">
        <div className={`text-center mb-16 reveal-up ${isVisible ? "visible" : ""}`}>
          <h2 className="text-foreground mb-4 max-w-3xl mx-auto">
            EXISTE UM MÉTODO COMPROVADO PRA FAZER SEU CRIATIVO{" "}
            <span className="gold-text">NÃO PARAR DE VENDER</span>
          </h2>
        </div>

        {/* Emblem + Pillars */}
        <div className={`relative flex items-center justify-center reveal-up ${isVisible ? "visible" : ""}`} style={{ transitionDelay: "300ms" }}>
          {/* Center emblem */}
          <div className="relative w-56 h-56 md:w-72 md:h-72 flex items-center justify-center">
            {/* Gold glow behind logo */}
            <div
              className={`absolute inset-0 rounded-full transition-all duration-1000 ${
                activePillars >= 6 ? "opacity-100" : "opacity-30"
              }`}
              style={{
                background: "radial-gradient(circle, hsl(42 90% 58% / 0.15) 0%, transparent 70%)",
                filter: "blur(30px)",
              }}
            />
            {/* Emblem border */}
            <div
              className={`absolute inset-4 md:inset-6 rounded-full transition-all duration-700 ${
                activePillars >= 6
                  ? "border-2 border-secondary/60 shadow-[0_0_40px_-5px_hsl(42_90%_58%/0.3)]"
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
              className={`relative z-10 w-20 h-20 md:w-28 md:h-28 object-contain transition-all duration-700 ${
                activePillars >= 6 ? "drop-shadow-[0_0_15px_hsl(42_90%_58%/0.4)]" : ""
              }`}
            />
          </div>

          {/* Pillars - positioned around the emblem */}
          <div className="hidden md:block">
            {pillars.map((pillar, i) => {
              const rad = (pillar.angle - 90) * (Math.PI / 180);
              const radius = 200;
              const x = Math.cos(rad) * radius;
              const y = Math.sin(rad) * radius;
              const isActive = i < activePillars;

              return (
                <motion.div
                  key={pillar.label}
                  className="absolute"
                  style={{
                    left: `calc(50% + ${x}px - 60px)`,
                    top: `calc(50% + ${y}px - 20px)`,
                    width: 120,
                  }}
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={isVisible ? { opacity: 1, scale: 1 } : {}}
                  transition={{ delay: 0.5 + i * 0.1, duration: 0.5 }}
                >
                  <div
                    className={`text-center px-3 py-2 rounded-xl border transition-all duration-700 ${
                      isActive
                        ? "border-secondary/40 bg-[hsl(42_90%_58%/0.08)] shadow-[0_0_20px_-5px_hsl(42_90%_58%/0.2)]"
                        : "border-border/20 bg-muted/10"
                    }`}
                  >
                    <span
                      className={`text-xs font-bold uppercase tracking-wider transition-colors duration-700 ${
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

          {/* Mobile pillars grid */}
          <div className="md:hidden absolute -bottom-40 left-0 right-0 grid grid-cols-3 gap-2 px-4">
            {pillars.map((pillar, i) => {
              const isActive = i < activePillars;
              return (
                <div
                  key={pillar.label}
                  className={`text-center px-2 py-2 rounded-xl border transition-all duration-500 ${
                    isActive
                      ? "border-secondary/40 bg-[hsl(42_90%_58%/0.08)]"
                      : "border-border/20 bg-muted/10"
                  }`}
                >
                  <span className={`text-[10px] font-bold uppercase ${isActive ? "text-secondary" : "text-muted-foreground/50"}`}>
                    {pillar.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* CTA after all pillars light up */}
        <div className={`text-center mt-32 md:mt-20 transition-all duration-700 ${activePillars >= 6 ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}>
          <button
            onClick={scrollToCTA}
            className="text-secondary hover:text-secondary/80 text-sm font-semibold underline underline-offset-4 transition-colors"
          >
            Quero o diagnóstico →
          </button>
        </div>
      </div>
    </section>
  );
}
